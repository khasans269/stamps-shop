// Список пунктов выдачи (ПВЗ + постаматы) города СДЭК.
// GET /api/cdek/points?city_code=<код> → { points: [{ code, name, address, workTime, type, lat, lon }] }

import { NextResponse } from "next/server";
import { listPoints } from "@/lib/cdek";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cityCode = Number(new URL(request.url).searchParams.get("city_code"));
  if (!Number.isFinite(cityCode) || cityCode <= 0) {
    return NextResponse.json(
      { points: [], error: "city_code обязателен" },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json({ points: await listPoints(cityCode, "ALL") });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cdek/points] ошибка:", detail);
    return NextResponse.json(
      { points: [], error: "CDEK points error", detail },
      { status: 502 }
    );
  }
}
