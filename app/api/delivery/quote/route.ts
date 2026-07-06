// Расчёт стоимости доставки Яндекс Доставки до выбранного ПВЗ.
//
// Форма шлёт сюда id выбранного пункта выдачи + состав корзины. Сервер
// считает вес по категориям, оценочную стоимость (из products.json) и
// запрашивает цену у Яндекса. Цену возвращаем фронту для показа.
//
// Оценочную стоимость и вес НЕ берём у клиента — считаем сами, по productId.
//
// Файл: app/api/delivery/quote/route.ts → POST /api/delivery/quote

import { NextResponse } from "next/server";
import { isAllowedOrigin } from "@/lib/order";
import { allProducts } from "@/lib/products";
import { calcPickupPrice, isConfigured } from "@/lib/yandex-delivery";

export const runtime = "nodejs";

// Достаём из тела список позиций [{productId, quantity}] и оценочную
// стоимость (сумма цен из products.json). Возвращает null при мусоре.
function parseItems(
  raw: unknown
): { items: Array<{ productId: string; quantity: number }>; assessedValueRub: number } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items: Array<{ productId: string; quantity: number }> = [];
  let assessedValueRub = 0;
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const productId = String((r as { productId?: unknown }).productId ?? "").trim();
    const quantity = Number((r as { quantity?: unknown }).quantity);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) return null;
    const product = allProducts.find((p) => p.id === productId);
    if (!product) return null;
    items.push({ productId, quantity });
    assessedValueRub += product.price * quantity;
  }
  return { items, assessedValueRub };
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ ok: false, error: "Запрос не разрешён" }, { status: 403 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ ok: true, configured: false });
  }

  let body: { pointId?: unknown; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный JSON" }, { status: 400 });
  }

  const pointId = typeof body.pointId === "string" ? body.pointId.trim() : "";
  const parsed = parseItems(body.items);
  if (!pointId || !parsed) {
    return NextResponse.json(
      { ok: false, error: "Не хватает данных для расчёта" },
      { status: 400 }
    );
  }

  try {
    const priceRub = await calcPickupPrice({
      destinationStationId: pointId,
      items: parsed.items,
      assessedValueRub: parsed.assessedValueRub,
    });
    return NextResponse.json({ ok: true, configured: true, price: priceRub });
  } catch (err) {
    console.error("[delivery/quote] ошибка:", err);
    return NextResponse.json(
      { ok: false, error: "Не удалось рассчитать стоимость доставки." },
      { status: 502 }
    );
  }
}
