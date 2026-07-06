// Клиент Яндекс Доставки (API «Доставка по России», b2b-платформа).
//
// Документация: https://yandex.ru/dev/logistics/delivery-api/
// Хост: https://b2b-authproxy.taxi.yandex.net
// Авторизация: заголовок Authorization: Bearer <OAuth-токен>
//   (токен — в личном кабинете Яндекс Доставки → «Ваш профиль»).
//
// Нужный нам сценарий (доставка до ПВЗ) — три шага:
//   1) location/detect      — по тексту адреса/города получаем geo_id;
//   2) pickup-points/list    — список ПВЗ в этом населённом пункте;
//   3) pricing-calculator    — цена доставки до выбранного ПВЗ.
//
// ВАЖНО: точные схемы запросов/ответов не проверены на живом API (нет
// токена на момент написания). Поля названы по докам; когда появится
// токен — сверить и поправить помеченные ⚠️ места. Пока токена нет,
// isConfigured() возвращает false и весь модуль «спит» — сайт работает на
// фикс-доставке/«рассчитаю отдельно», не падая.
//
// Все ключи — только в переменных окружения, не в коде/git.

import {
  DEFAULT_PARCEL_CM,
  getOrderWeightGrams,
} from "@/lib/delivery";

// Хост API. Боевой — b2b-authproxy.taxi.yandex.net, тестовый —
// b2b.taxi.tst.yandex.net. Берём из env, чтобы переключаться без правки кода.
// По умолчанию — боевой.
function apiHost(): string {
  return (
    process.env.YANDEX_DELIVERY_HOST?.trim() ||
    "https://b2b-authproxy.taxi.yandex.net"
  );
}

// ── Конфигурация ──────────────────────────────────────────────────────────────

// Настроен ли модуль: есть токен и адрес отправления (склад продавца).
export function isConfigured(): boolean {
  return Boolean(
    process.env.YANDEX_DELIVERY_API_TOKEN &&
      process.env.YANDEX_DELIVERY_SOURCE_STATION_ID
  );
}

function token(): string {
  const t = process.env.YANDEX_DELIVERY_API_TOKEN;
  if (!t) throw new Error("YANDEX_DELIVERY_API_TOKEN не задан");
  return t;
}

// platform_station_id склада-отправителя продавца (source для расчёта).
function sourceStationId(): string {
  const s = process.env.YANDEX_DELIVERY_SOURCE_STATION_ID;
  if (!s) throw new Error("YANDEX_DELIVERY_SOURCE_STATION_ID не задан");
  return s;
}

// Общий помощник запроса к API Яндекс Доставки.
async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${apiHost()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      // API ждёт язык ответа в этом заголовке.
      "Accept-Language": "ru",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Яндекс Доставка ${path} ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Яндекс Доставка ${path}: ответ не JSON: ${text.slice(0, 300)}`);
  }
}

// ── Типы, которые отдаём наружу (упрощённые) ─────────────────────────────────

export interface PickupPoint {
  id: string; // platform_station_id пункта (нужен для расчёта и заказа)
  name: string; // название/оператор ПВЗ
  address: string; // человекочитаемый адрес
}

// ── 1. Определение geo_id по адресу ──────────────────────────────────────────
// POST /api/b2b/platform/location/detect
// ⚠️ Тело/ответ уточнить по живому API. По докам принимает строку адреса,
// возвращает варианты населённых пунктов с geo_id.
export async function detectGeoId(
  address: string
): Promise<{ geoId: number; address: string } | null> {
  const data = (await post("/api/b2b/platform/location/detect", {
    location: address,
  })) as {
    variants?: Array<{ geo_id?: number; address?: string }>;
  };

  const first = data.variants?.[0];
  if (!first || typeof first.geo_id !== "number") {
    return null;
  }
  return { geoId: first.geo_id, address: first.address ?? address };
}

// ── 2. Список ПВЗ в населённом пункте ────────────────────────────────────────
// POST /api/b2b/platform/pickup-points/list
// ⚠️ Тело/ответ уточнить. Фильтруем по geo_id и типу «ПВЗ».
export async function listPickupPoints(geoId: number): Promise<PickupPoint[]> {
  const data = (await post("/api/b2b/platform/pickup-points/list", {
    geo_id: geoId,
    // Только пункты выдачи (не постаматы/склады) — тип уточнить по докам.
    type: "pickup_point",
    payment_method: "already_paid", // оплата уже на сайте
  })) as {
    points?: Array<{
      id?: string;
      operator_station_id?: string;
      name?: string;
      address?: { full_address?: string } | string;
    }>;
  };

  const points = data.points ?? [];
  return points
    .map((p): PickupPoint | null => {
      const id = p.id ?? p.operator_station_id;
      if (!id) return null;
      const address =
        typeof p.address === "string"
          ? p.address
          : p.address?.full_address ?? "";
      return { id, name: p.name ?? "ПВЗ", address };
    })
    .filter((p): p is PickupPoint => p !== null);
}

// ── 3. Расчёт стоимости доставки до ПВЗ ──────────────────────────────────────
// POST /api/b2b/platform/pricing-calculator
// ⚠️ Тело/ответ уточнить. Передаём source (склад продавца), destination
// (станция выбранного ПВЗ), вес и габариты, оценочную стоимость.
export async function calcPickupPrice(params: {
  destinationStationId: string;
  items: Array<{ productId: string; quantity: number }>;
  assessedValueRub: number; // оценочная стоимость вложения (для страховки)
}): Promise<number> {
  const weightGrams = getOrderWeightGrams(params.items);

  const data = (await post("/api/b2b/platform/pricing-calculator", {
    source: { platform_station: { platform_id: sourceStationId() } },
    destination: {
      platform_station: { platform_id: params.destinationStationId },
    },
    total_weight: weightGrams, // граммы
    total_assessed_price: rubToApi(params.assessedValueRub),
    // Одно грузоместо на весь заказ с типовыми габаритами.
    places: [
      {
        physical_dims: {
          weight_gross: weightGrams,
          dx: DEFAULT_PARCEL_CM.length,
          dy: DEFAULT_PARCEL_CM.width,
          dz: DEFAULT_PARCEL_CM.height,
        },
      },
    ],
    payment_method: "already_paid",
    tariff: "self_pickup", // доставка до ПВЗ; код тарифа уточнить
  })) as {
    // Ответ может называть итог по-разному — пробуем известные варианты.
    pricing_total?: number | string;
    price?: number | string;
    total_price?: number | string;
  };

  const raw = data.pricing_total ?? data.price ?? data.total_price;
  const rub = Number(raw);
  if (!Number.isFinite(rub) || rub < 0) {
    throw new Error(
      `Яндекс Доставка: не удалось разобрать цену из ответа: ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  // Округляем до целых рублей вверх — копейки в доставке не показываем.
  return Math.ceil(rub);
}

// Оценочная стоимость в формате API. Многие методы Яндекса ждут сумму
// строкой рублей с копейками; ⚠️ уточнить (возможно — в копейках числом).
function rubToApi(rub: number): string {
  return rub.toFixed(2);
}
