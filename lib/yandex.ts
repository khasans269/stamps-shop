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

import { DEFAULT_PARCEL_CM } from "@/lib/delivery";

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
}): Promise<number> {
  const { token, sourceStation, base } = config();
  if (!token || !sourceStation) {
    throw new Error("Не заданы YANDEX_DELIVERY_TOKEN / SOURCE_STATION_ID");
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

  let data: { pricing_total?: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Некорректный JSON от Яндекса: ${text.slice(0, 200)}`);
  }
  if (!data.pricing_total) {
    throw new Error(`В ответе нет pricing_total: ${text.slice(0, 200)}`);
  }

  return Math.ceil(parseRub(data.pricing_total));
}
