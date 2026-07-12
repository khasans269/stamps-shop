// Общая серверная логика СДЭК для кастомного выбора ПВЗ (без виджета):
// авторизация, подсказка городов, список пунктов, расчёт цены.
// Ключи СДЭК живут только на сервере (env). По умолчанию — публичные
// тестовые креды и тестовый хост; для боевого режима задать CDEK_ACCOUNT /
// CDEK_SECRET / CDEK_API_BASE=https://api.cdek.ru/v2.

import { cdekRetailDeliveryPrice } from "@/lib/delivery";

// Публичные тестовые креды СДЭК (api.edu.cdek.ru).
const TEST_ACCOUNT = "wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP";
const TEST_SECRET = "RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5";
const TEST_BASE = "https://api.edu.cdek.ru/v2";

// Город отправления продавца (СПб). code 137 — код города СПб в СДЭК.
export const FROM_CITY_CODE = 137;

function config() {
  return {
    account: process.env.CDEK_ACCOUNT || TEST_ACCOUNT,
    secret: process.env.CDEK_SECRET || TEST_SECRET,
    base: (process.env.CDEK_API_BASE || TEST_BASE).replace(/\/+$/, ""),
  };
}

const APP_HEADERS = {
  Accept: "application/json",
  "X-App-Name": "widget_pvz",
  "X-App-Version": "3.11.1",
};

// ── OAuth-токен (кэш в памяти процесса на ~1 час) ────────────────────────────
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const { account, secret, base } = config();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: account,
    client_secret: secret,
  });
  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`CDEK oauth ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("CDEK: нет access_token в ответе OAuth");
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function cdekGet(path: string, token: string): Promise<unknown> {
  const { base } = config();
  const res = await fetch(`${base}/${path}`, {
    method: "GET",
    headers: { ...APP_HEADERS, Authorization: `Bearer ${token}` },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`CDEK GET ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

// ── Подсказка городов ────────────────────────────────────────────────────────
export interface CitySuggestion {
  cityCode: number;
  name: string;
  region: string;
}

export async function suggestCities(query: string): Promise<CitySuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const token = await getToken();
  const params = new URLSearchParams({ name: q, country_code: "RU" });
  const data = (await cdekGet(
    `location/suggest/cities?${params.toString()}`,
    token
  )) as Array<{ code?: number; city?: string; region?: string }> | null;
  if (!Array.isArray(data)) return [];
  return data
    .filter((c) => typeof c.code === "number" && c.city)
    .slice(0, 15)
    .map((c) => ({
      cityCode: c.code as number,
      name: c.city as string,
      region: c.region ?? "",
    }));
}

// ВРЕМЕННО (отладка): сырой ответ СДЭК на подсказку городов — чтобы увидеть
// реальные имена полей. Удалить после настройки парсера.
export async function debugCitiesRaw(query: string): Promise<unknown> {
  const token = await getToken();
  const params = new URLSearchParams({ name: query, country_code: "RU" });
  return cdekGet(`location/suggest/cities?${params.toString()}`, token);
}

// ── Пункты выдачи города ─────────────────────────────────────────────────────
export interface DeliveryPoint {
  code: string;
  name: string;
  address: string;
  workTime: string;
  type: "PVZ" | "POSTAMAT";
  lat: number | null;
  lon: number | null;
}

// type: "PVZ" | "POSTAMAT" | "ALL" — какие точки запрашивать у СДЭК.
export async function listPoints(
  cityCode: number,
  type: "PVZ" | "POSTAMAT" | "ALL" = "ALL"
): Promise<DeliveryPoint[]> {
  const token = await getToken();
  const params = new URLSearchParams({
    city_code: String(cityCode),
    country_code: "RU",
    type,
    is_handout: "true", // точки, где можно ЗАБРАТЬ заказ
  });
  const data = (await cdekGet(
    `deliverypoints?${params.toString()}`,
    token
  )) as Array<{
    code?: string;
    name?: string;
    type?: string;
    work_time?: string;
    location?: {
      address_full?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
    };
  }> | null;
  if (!Array.isArray(data)) return [];
  return data
    .filter((p) => p.code)
    .map((p) => ({
      code: p.code as string,
      name: p.name ?? "",
      address: p.location?.address_full ?? p.location?.address ?? "",
      workTime: p.work_time ?? "",
      type: p.type === "POSTAMAT" ? "POSTAMAT" : "PVZ",
      lat: p.location?.latitude ?? null,
      lon: p.location?.longitude ?? null,
    }));
}

// ── Расчёт цены до города (ПВЗ и постамат) ───────────────────────────────────
// Один запрос tarifflist (type=2 — открывает экономные «Посылка»). Из ответа
// берём самый дешёвый тариф «склад-склад» (для ПВЗ, delivery_mode 4) и
// «склад-постамат» (для постаматов, delivery_mode 7). Базовую цену прогоняем
// через розничную наценку (НДС/страховка/упаковка/налог).
export interface CityPrices {
  pvz: number | null; // розничная цена доставки в ПВЗ
  postamat: number | null; // розничная цена доставки в постамат (или null)
}

export async function calcCityPrices(params: {
  cityCode: number;
  weightGrams: number;
  orderSum: number;
}): Promise<CityPrices> {
  const { cityCode, weightGrams, orderSum } = params;
  const token = await getToken();
  const { base } = config();
  const res = await fetch(`${base}/calculator/tarifflist`, {
    method: "POST",
    headers: {
      ...APP_HEADERS,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: 2, // обычная доставка — доступны экономные тарифы «Посылка»
      from_location: { code: FROM_CITY_CODE },
      to_location: { code: cityCode },
      packages: [{ weight: weightGrams, length: 20, width: 15, height: 10 }],
    }),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`CDEK tarifflist ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as {
    tariff_codes?: Array<{ delivery_mode?: number; delivery_sum?: number }>;
  };
  const tariffs = Array.isArray(data.tariff_codes) ? data.tariff_codes : [];

  // Минимальная базовая цена для нужного режима доставки.
  const cheapestBase = (mode: number): number | null => {
    const sums = tariffs
      .filter((t) => t.delivery_mode === mode && Number.isFinite(t.delivery_sum))
      .map((t) => Number(t.delivery_sum));
    return sums.length ? Math.min(...sums) : null;
  };

  const pvzBase = cheapestBase(4); // склад-склад → выдача в ПВЗ
  const postamatBase = cheapestBase(7); // склад-постамат → выдача в постамат

  return {
    pvz: pvzBase != null ? cdekRetailDeliveryPrice(Math.ceil(pvzBase), orderSum) : null,
    postamat:
      postamatBase != null
        ? cdekRetailDeliveryPrice(Math.ceil(postamatBase), orderSum)
        : null,
  };
}
