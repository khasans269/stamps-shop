// Прокси для виджета ПВЗ СДЭК — серверная часть, которую виджет вызывает
// по `servicePath`. Повторяет логику эталонного service.php из репозитория
// СДЭК (@cdek-it/widget), но на Next.js/Node вместо PHP.
//
// Виджет шлёт сюда два вида запросов:
//   • action=offices   — список пунктов выдачи (GET, параметры в query);
//   • action=calculate — расчёт стоимости и сроков (POST, параметры в теле).
//
// Мы получаем OAuth-токен у СДЭК по client_id/client_secret и проксируем
// запрос в их API 2.0 (deliverypoints / calculator/tarifflist), возвращая
// ответ как есть. Ключи СДЭК живут только на сервере (в env).
//
// По умолчанию используются ПУБЛИЧНЫЕ ТЕСТОВЫЕ ключи СДЭК и тестовый хост
// (api.edu.cdek.ru) — расчёт работает сразу, но на тестовых данных. Для
// боевого режима задай CDEK_ACCOUNT / CDEK_SECRET (из ЛК СДЭК) и
// CDEK_API_BASE=https://api.cdek.ru/v2.
//
// Файл: app/api/cdek/service/route.ts → GET/POST /api/cdek/service

import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Публичные тестовые креды СДЭК для песочницы (api.edu.cdek.ru). СДЭК их
// периодически меняет — актуальные берём из официального SDK.
const TEST_ACCOUNT = "wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP";
const TEST_SECRET = "RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5";
const TEST_BASE = "https://api.edu.cdek.ru/v2";

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

// ── Кэш OAuth-токена ─────────────────────────────────────────────────────────
// Токен СДЭК живёт ~1 час. Кэшируем в памяти процесса, чтобы не логиниться
// на каждый запрос виджета (их бывает много при листании карты).
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
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

// Список пунктов выдачи. Параметры (city_code, country_code, type и т.д.)
// приходят от виджета в query — пробрасываем их в deliverypoints.
async function offices(params: URLSearchParams, token: string): Promise<Response> {
  const { base } = config();
  params.delete("action");
  const res = await fetch(`${base}/deliverypoints?${params.toString()}`, {
    method: "GET",
    headers: { ...APP_HEADERS, Authorization: `Bearer ${token}` },
  });
  const text = await res.text().catch(() => "");
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

// Расчёт тарифов. Тело запроса виджет формирует сам — пробрасываем в
// calculator/tarifflist как JSON.
async function calculate(body: Record<string, unknown>, token: string): Promise<Response> {
  const { base } = config();
  delete body.action;
  const res = await fetch(`${base}/calculator/tarifflist`, {
    method: "POST",
    headers: {
      ...APP_HEADERS,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams;

  // Тело (для POST/calculate). Может быть пустым.
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }

  const action = (body.action as string) || query.get("action") || "";

  try {
    const token = await getToken();
    if (action === "offices") {
      return await offices(query, token);
    }
    if (action === "calculate") {
      // Объединяем query + body, как делает эталонный service.php.
      const merged: Record<string, unknown> = {
        ...Object.fromEntries(query.entries()),
        ...body,
      };
      return await calculate(merged, token);
    }
    return NextResponse.json({ message: "Unknown action" }, { status: 400 });
  } catch (err) {
    // Текст ошибки кладём в ответ, чтобы было видно причину в Network/логах
    // (сообщения СДЭК не содержат секретов). При желании позже убрать detail.
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cdek/service] ошибка:", detail);
    return NextResponse.json(
      { message: "CDEK service error", detail },
      { status: 502 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
