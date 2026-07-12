// Автоподсказка городов СДЭК для кастомного выбора ПВЗ.
// GET /api/cdek/cities?q=<текст> → { cities: [{ cityCode, name, region }] }

import { NextResponse } from "next/server";
import { suggestCities, debugCitiesRaw } from "@/lib/cdek";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  try {
    // ВРЕМЕННО: ?debug=1 — вернуть сырой ответ СДЭК для настройки парсера.
    if (url.searchParams.get("debug") === "1") {
      return NextResponse.json({ raw: await debugCitiesRaw(q) });
    }
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
