// Серверный расчёт стоимости доставки Яндекс Доставки до ПВЗ.
//
// Почему на сервере: клиентский виджет Яндекса считает цену через сторонний
// хост и это ломается, когда браузер режет сторонние cookie (инкогнито,
// Safari и т.п.). Виджет мы оставляем только для ВЫБОРА пункта на карте
// (это работает стабильно), а цену считаем здесь — одинаково для всех
// браузеров, по методу 1.01 «Предварительная оценка стоимости доставки».
//
// Токен живёт только на сервере (env). Нужны:
//   YANDEX_DELIVERY_TOKEN — Bearer-токен API Яндекс Доставки;
//   YANDEX_DELIVERY_SOURCE_STATION_ID — id станции отгрузки (наш склад);
//   YANDEX_DELIVERY_API_BASE — по умолчанию боевой хост.

import { DEFAULT_PARCEL_CM, yandexRetailDeliveryPrice } from "@/lib/delivery";

// Боевой хост API. Тестовый — https://b2b.taxi.tst.yandex.net.
const PROD_BASE = "https://b2b-authproxy.taxi.yandex.net";

function config() {
  return {
    token: process.env.YANDEX_DELIVERY_TOKEN || "",
    sourceStation: process.env.YANDEX_DELIVERY_SOURCE_STATION_ID || "",
    base: (process.env.YANDEX_DELIVERY_API_BASE || PROD_BASE).replace(
      /\/+$/,
      ""
    ),
  };
}

// Есть ли всё необходимое, чтобы считать цену Яндекса на сервере.
export function isYandexPricingConfigured(): boolean {
  const { token, sourceStation } = config();
  return Boolean(token && sourceStation);
}

// Общие заголовки авторизации для API Яндекс Доставки.
function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ── Подсказка населённого пункта (geo_id) ────────────────────────────────────
// Метод 2.01 location/detect: по названию города возвращает geo_id.
export interface YandexGeo {
  geoId: number;
  address: string;
}

export async function suggestYandexGeo(query: string): Promise<YandexGeo[]> {
  // Браузер часто подставляет «г. Сибай» — Яндекс по такой строке ищет хуже.
  const q = query
    .trim()
    .replace(/^(г\.?|город)\s+/i, "")
    .trim();
  if (q.length < 2) return [];
  const { token, base } = config();
  if (!token) throw new Error("Не задан YANDEX_DELIVERY_TOKEN");
  const resp = await fetch(`${base}/api/b2b/platform/location/detect`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ location: q }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Яндекс location/detect ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = JSON.parse(text) as {
    variants?: Array<{ geo_id?: number; address?: string }>;
  };
  return (data.variants ?? [])
    .filter((v) => typeof v.geo_id === "number")
    .slice(0, 15)
    .map((v) => ({ geoId: v.geo_id as number, address: v.address ?? q }));
}

// ── Список пунктов выдачи по geo_id ──────────────────────────────────────────
// Метод 2.02 pickup-points/list: по geo_id возвращает все ПВЗ/постаматы города
// со всеми операторами (в т.ч. 5post) — это то, чего не умеет виджет.
export interface YandexPoint {
  id: string; // platform_station_id — идентификатор для расчёта цены
  operatorId: string; // "5post", "market_l4g", ...
  name: string; // "5 Post (Пятерочка)", "Пункт выдачи Яндекса", ...
  type: "pickup_point" | "terminal";
  address: string;
  comment: string; // инструкция как найти пункт
  lat: number | null;
  lon: number | null;
}

interface RawYandexPoint {
  id?: string;
  operator_id?: string;
  name?: string;
  type?: string;
  position?: { latitude?: number; longitude?: number };
  address?: { full_address?: string };
  instruction?: string;
}

// Разбор ответа pickup-points/list в наши точки (общий для обоих режимов).
function parseYandexPoints(text: string): YandexPoint[] {
  const data = JSON.parse(text) as unknown;
  const raw: RawYandexPoint[] = Array.isArray(data)
    ? (data as RawYandexPoint[])
    : ((data as { points?: RawYandexPoint[] }).points ?? []);
  return raw
    .filter((p) => p.id && (p.type === "pickup_point" || p.type === "terminal"))
    .map((p) => ({
      id: p.id as string,
      operatorId: p.operator_id ?? "",
      name: p.name ?? "",
      type: p.type === "terminal" ? "terminal" : "pickup_point",
      address: p.address?.full_address ?? "",
      comment: p.instruction ?? "",
      lat: p.position?.latitude ?? null,
      lon: p.position?.longitude ?? null,
    }));
}

export async function listYandexPoints(geoId: number): Promise<YandexPoint[]> {
  const { token, base } = config();
  if (!token) throw new Error("Не задан YANDEX_DELIVERY_TOKEN");
  const resp = await fetch(`${base}/api/b2b/platform/pickup-points/list`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ geo_id: geoId }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(
      `Яндекс pickup-points/list ${resp.status}: ${text.slice(0, 200)}`
    );
  }
  return parseYandexPoints(text);
}


// Ответ метода: { pricing_total: "225.7 RUB", delivery_days: 7 }.
// Достаём число рублей из строки вида "225.7 RUB".
function parseRub(pricingTotal: string): number {
  const num = parseFloat(String(pricingTotal).replace(",", ".").trim());
  if (!isFinite(num)) {
    throw new Error(`Не удалось разобрать стоимость: "${pricingTotal}"`);
  }
  return num;
}

// Считает стоимость доставки до конкретного ПВЗ Яндекса (round up до рубля).
// destinationPointId — id пункта, который вернул виджет при выборе.
export async function getYandexPvzPrice(params: {
  destinationPointId: string;
  weightGrams: number;
  orderSumRub: number;
}): Promise<{ price: number; days: number | null }> {
  const { token, sourceStation, base } = config();
  if (!token || !sourceStation) {
    // Диагностика без утечки секрета: сообщаем только факт наличия и длину,
    // чтобы понять, какую переменную не отдаёт хостинг.
    throw new Error(
      `Нет доступов: YANDEX_DELIVERY_TOKEN=${
        token ? `есть (${token.length} симв.)` : "ПУСТО"
      }, YANDEX_DELIVERY_SOURCE_STATION_ID=${
        sourceStation ? `есть (${sourceStation.length} симв.)` : "ПУСТО"
      }`
    );
  }

  const body = {
    source: { platform_station_id: sourceStation },
    destination: { platform_station_id: params.destinationPointId },
    // self_pickup — доставка до ПВЗ/постамата.
    tariff: "self_pickup",
    total_weight: params.weightGrams,
    // Оценочная стоимость (для страховки) — в копейках.
    total_assessed_price: Math.round(params.orderSumRub * 100),
    client_price: 0,
    payment_method: "already_paid",
    places: [
      {
        physical_dims: {
          weight_gross: params.weightGrams,
          dx: DEFAULT_PARCEL_CM.length,
          dy: DEFAULT_PARCEL_CM.height,
          dz: DEFAULT_PARCEL_CM.width,
        },
      },
    ],
  };

  const resp = await fetch(`${base}/api/b2b/platform/pricing-calculator`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    // Тело ответа Яндекса не содержит секретов — логируем для диагностики.
    throw new Error(`Яндекс API ${resp.status}: ${text.slice(0, 300)}`);
  }

  let data: { pricing_total?: string; delivery_days?: number };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Некорректный JSON от Яндекса: ${text.slice(0, 200)}`);
  }
  if (!data.pricing_total) {
    throw new Error(`В ответе нет pricing_total: ${text.slice(0, 200)}`);
  }

  // Цену Яндекса оборачиваем розничной наценкой (упаковка + налог); срок
  // (delivery_days) берём как есть — это расчётное число дней доставки.
  return {
    price: yandexRetailDeliveryPrice(parseRub(data.pricing_total)),
    days: typeof data.delivery_days === "number" ? data.delivery_days : null,
  };
}
