// Розничная цена доставки СДЭК в город (ПВЗ и постамат), с наценкой продавца.
// POST /api/cdek/price  { cityCode, weightGrams, orderSum }
//   → { pvz: number|null, postamat: number|null }
// Наценка (НДС/страховка/упаковка/налог) считается на сервере — клиент не
// может её занизить.

import { NextResponse } from "next/server";
import { calcCityPrices } from "@/lib/cdek";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const cityCode = Number(body.cityCode);
  const weightRaw = Number(body.weightGrams);
  const orderRaw = Number(body.orderSum);

  if (!Number.isFinite(cityCode) || cityCode <= 0) {
    return NextResponse.json(
      { pvz: null, postamat: null, error: "cityCode обязателен" },
      { status: 400 }
    );
  }

  const weightGrams = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 300;
  const orderSum = Number.isFinite(orderRaw) && orderRaw >= 0 ? orderRaw : 0;

  try {
    const prices = await calcCityPrices({ cityCode, weightGrams, orderSum });
    return NextResponse.json(prices);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cdek/price] ошибка:", detail);
    return NextResponse.json(
      { pvz: null, postamat: null, error: "CDEK price error", detail },
      { status: 502 }
    );
  }
}
