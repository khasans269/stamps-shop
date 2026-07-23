// ВРЕМЕННЫЙ диагностический роут (удалить после сборки выбора ПВЗ).
// GET /api/yandex/points-test?geo=Сибай
//   1) location/detect → geo_id по названию города;
//   2) pickup-points/list по geo_id → точки (все операторы, вкл. 5post);
//   3) возвращаем счётчик операторов и ПОЛНЫЙ пример точки, чтобы увидеть
//      реальную форму вложенных полей (координаты, адрес, расписание).

import { NextResponse } from "next/server";

export const runtime = "nodejs";

function auth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function GET(request: Request) {
  const token = process.env.YANDEX_DELIVERY_TOKEN || "";
  const base = (
    process.env.YANDEX_DELIVERY_API_BASE || "https://b2b-authproxy.taxi.yandex.net"
  ).replace(/\/+$/, "");
  if (!token) {
    return NextResponse.json({ error: "нет YANDEX_DELIVERY_TOKEN" }, { status: 500 });
  }
  const city = new URL(request.url).searchParams.get("geo") || "Сибай";

  try {
    // 1) geo_id
    const geoResp = await fetch(`${base}/api/b2b/platform/location/detect`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ location: city }),
    });
    const geoText = await geoResp.text();
    if (!geoResp.ok) {
      return NextResponse.json(
        { step: "location/detect", status: geoResp.status, body: geoText.slice(0, 400) },
        { status: 502 }
      );
    }
    const geoData = JSON.parse(geoText) as {
      variants?: Array<{ geo_id?: number; address?: string }>;
    };
    const variants = geoData.variants ?? [];
    const geoId = variants[0]?.geo_id;
    if (typeof geoId !== "number") {
      return NextResponse.json({ step: "geo", city, variants }, { status: 200 });
    }

    // 2) точки по geo_id
    const ptResp = await fetch(`${base}/api/b2b/platform/pickup-points/list`, {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ geo_id: geoId }),
    });
    const ptText = await ptResp.text();
    if (!ptResp.ok) {
      return NextResponse.json(
        { step: "pickup-points/list", status: ptResp.status, body: ptText.slice(0, 400) },
        { status: 502 }
      );
    }
    const ptData = JSON.parse(ptText) as unknown;
    const points: Array<Record<string, unknown>> = Array.isArray(ptData)
      ? (ptData as Array<Record<string, unknown>>)
      : (((ptData as Record<string, unknown>).points as Array<
          Record<string, unknown>
        >) ?? []);

    const operators: Record<string, number> = {};
    for (const p of points) {
      const op = String(p.operator_id ?? "unknown");
      operators[op] = (operators[op] ?? 0) + 1;
    }

    return NextResponse.json({
      city,
      geoId,
      geoVariants: variants.slice(0, 5),
      total: points.length,
      operators,
      // Полный первый пункт — чтобы увидеть форму position/address/schedule.
      samplePoint: points[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
