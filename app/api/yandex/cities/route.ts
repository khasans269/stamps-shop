// Подсказка населённого пункта Яндекс Доставки (geo_id) для выбора ПВЗ.
// GET /api/yandex/cities?q=Сибай → { cities: [{ geoId, address }] }

import { NextResponse } from "next/server";
import { suggestYandexGeo } from "@/lib/yandex";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const cities = await suggestYandexGeo(q);
    return NextResponse.json({ cities });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[yandex/cities] ошибка:", detail);
    return NextResponse.json(
      { cities: [], error: "Yandex geo error", detail },
      { status: 502 }
    );
  }
}
