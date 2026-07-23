// Список пунктов выдачи Яндекс Доставки по geo_id (все операторы, вкл. 5post).
// GET /api/yandex/points?geoId=20716 → { points: [...] }

import { NextResponse } from "next/server";
import { listYandexPoints, listYandexPointsNear } from "@/lib/yandex";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  // Режим «рядом со мной»: если переданы координаты — ищем по ним.
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const near =
    Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);
  const geoId = Number(sp.get("geoId"));
  if (!near && (!Number.isFinite(geoId) || geoId <= 0)) {
    return NextResponse.json(
      { points: [], error: "нужен geoId или lat/lon" },
      { status: 400 }
    );
  }
  try {
    const points = near
      ? await listYandexPointsNear(lat, lon)
      : await listYandexPoints(geoId);
    return NextResponse.json({ points });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[yandex/points] ошибка:", detail);
    return NextResponse.json(
      { points: [], error: "Yandex points error", detail },
      { status: 502 }
    );
  }
}
