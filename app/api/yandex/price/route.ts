// Стоимость доставки Яндекс Доставки до выбранного ПВЗ — считается на сервере.
// POST /api/yandex/price  { pointId, weightGrams, orderSum }  → { price: number }
//
// Виджет отдаёт id выбранного пункта, а цену мы считаем здесь (метод 1.01),
// чтобы она приходила одинаково во всех браузерах, без зависимости от
// сторонних cookie виджета.

import { NextResponse } from "next/server";
import { getYandexPvzPrice } from "@/lib/yandex";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const pointId = typeof body.pointId === "string" ? body.pointId.trim() : "";
  const weightRaw = Number(body.weightGrams);
  const orderRaw = Number(body.orderSum);

  if (!pointId) {
    return NextResponse.json(
      { price: null, error: "pointId обязателен" },
      { status: 400 }
    );
  }

  const weightGrams =
    Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 300;
  const orderSumRub = Number.isFinite(orderRaw) && orderRaw >= 0 ? orderRaw : 0;

  try {
    const { price, days } = await getYandexPvzPrice({
      destinationPointId: pointId,
      weightGrams,
      orderSumRub,
    });
    return NextResponse.json({ price, days });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[yandex/price] ошибка:", detail);
    return NextResponse.json(
      { price: null, error: "Yandex price error", detail },
      { status: 502 }
    );
  }
}
