// Список пунктов выдачи Яндекс Доставки по geo_id (все операторы, вкл. 5post).
// GET /api/yandex/points?geoId=20716 → { points: [...] }

import { NextResponse } from "next/server";
import { listYandexPoints } from "@/lib/yandex";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const geoId = Number(new URL(request.url).searchParams.get("geoId"));
  if (!Number.isFinite(geoId) || geoId <= 0) {
    return NextResponse.json(
      { points: [], error: "geoId обязателен" },
      { status: 400 }
    );
  }
  try {
    const points = await listYandexPoints(geoId);
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
