// Автоподсказка городов СДЭК для кастомного выбора ПВЗ.
// GET /api/cdek/cities?q=<текст> → { cities: [{ cityCode, name, region }] }

import { NextResponse } from "next/server";
import { suggestCities } from "@/lib/cdek";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ cities: await suggestCities(q) });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cdek/cities] ошибка:", detail);
    return NextResponse.json(
      { cities: [], error: "CDEK cities error", detail },
      { status: 502 }
    );
  }
}
