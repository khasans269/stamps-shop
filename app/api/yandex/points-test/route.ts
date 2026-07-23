// ВРЕМЕННЫЙ диагностический роут (удалить после проверки).
// Проверяем, каких операторов ПВЗ (в т.ч. 5post) реально отдаёт API Яндекса
// по нашему аккаунту. Метод pickup-points/list с пустым телом возвращает все
// доступные точки. Агрегируем по операторам, чтобы не тащить весь список.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const token = process.env.YANDEX_DELIVERY_TOKEN || "";
  const base = (
    process.env.YANDEX_DELIVERY_API_BASE || "https://b2b-authproxy.taxi.yandex.net"
  ).replace(/\/+$/, "");
  if (!token) {
    return NextResponse.json({ error: "нет YANDEX_DELIVERY_TOKEN" }, { status: 500 });
  }
  try {
    const resp = await fetch(`${base}/api/b2b/platform/pickup-points/list`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({}),
    });
    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { status: resp.status, body: text.slice(0, 500) },
        { status: 502 }
      );
    }
    const data = JSON.parse(text) as unknown;
    // Ответ может быть массивом точек или { points: [...] }.
    const points: Array<Record<string, unknown>> = Array.isArray(data)
      ? (data as Array<Record<string, unknown>>)
      : (((data as Record<string, unknown>).points as Array<
          Record<string, unknown>
        >) ?? []);

    const operators: Record<string, number> = {};
    for (const p of points) {
      const op = String(p.operator_id ?? p.operator ?? "unknown");
      operators[op] = (operators[op] ?? 0) + 1;
    }
    // Пример одной точки — чтобы увидеть реальные имена полей.
    const sample = points[0]
      ? Object.keys(points[0]).reduce((acc, k) => {
          const v = (points[0] as Record<string, unknown>)[k];
          acc[k] = typeof v === "object" ? "[object]" : v;
          return acc;
        }, {} as Record<string, unknown>)
      : null;

    return NextResponse.json({
      total: points.length,
      operators,
      sampleKeys: sample,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
