// ВРЕМЕННЫЙ диагностический роут для проверки интеграции с Weeek CRM живьём.
//
// Открой на боевом домене:
//   /api/weeek/ping             — проверяет токен и авто-резолв воронки/статуса
//                                 (сделку НЕ создаёт), возвращает найденные id.
//   /api/weeek/ping?test=1      — дополнительно создаёт ТЕСТОВУЮ сделку в Weeek,
//                                 чтобы убедиться, что она реально появляется.
//
// Удалить после проверки настройки (как временный роут /api/whoami).

import { NextResponse } from "next/server";
import type { IncomingOrder } from "@/lib/order";
import { sendToWeeek, weeekDiagnostics } from "@/lib/weeek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const diag = await weeekDiagnostics();

  const wantTest = new URL(request.url).searchParams.get("test") === "1";
  if (!wantTest || !diag.ok) {
    return NextResponse.json(diag);
  }

  // Тестовая сделка — с явно «тестовыми» данными, чтобы её было легко удалить.
  const testOrder: IncomingOrder = {
    contact: {
      name: "ТЕСТ — проверка Weeek",
      phone: "+7 900 000-00-00",
      email: "test@example.com",
      telegram: "@test",
    },
    delivery: {
      method: "pickup",
      methodLabel: "Самовывоз (тест)",
      address: "Тестовый адрес",
      pointId: null,
    },
    comment: "Тестовая сделка из /api/weeek/ping — можно удалить",
    items: [
      { productId: "test", name: "Тестовый товар", price: 500, quantity: 1, sum: 500 },
    ],
    itemsTotal: 500,
    deliveryFee: 0,
    grandTotal: 500,
  };

  try {
    const dealId = await sendToWeeek(`ТЕСТ-${Date.now()}`, testOrder);
    return NextResponse.json({ ...diag, testDealCreated: true, dealId });
  } catch (err) {
    return NextResponse.json({ ...diag, testDealCreated: false, error: String(err) });
  }
}
