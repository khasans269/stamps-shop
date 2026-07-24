// Серверный роут «заявка без оплаты» — старый флоу оформления заказа.
//
// С появлением оплаты через ЮKassa основная форма шлёт заказ в
// /api/payment/create (создание платежа). Этот роут оставлен как запасной
// путь: он просто принимает заявку и шлёт её в Telegram + Google Sheets,
// без приёма денег. Вся общая логика (валидация, отправка) вынесена в
// lib/order.ts, поэтому здесь только «склейка».
//
// Файл живёт в app/api/checkout/route.ts по правилу App Router:
//   POST /api/checkout → экспорт async function POST(request)

import { NextResponse } from "next/server";
import {
  generateOrderId,
  isAllowedOrigin,
  sendToSheets,
  sendToTelegram,
  validateOrder,
} from "@/lib/order";
import { sendToWeeek } from "@/lib/weeek";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // 1) Origin-проверка — отсекаем «голые» POST-запросы с чужих сайтов.
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json(
      { ok: false, error: "Запрос не разрешён" },
      { status: 403 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Не удалось разобрать JSON тела запроса" },
      { status: 400 }
    );
  }

  // 2) Honeypot — скрытое поле "website". У реального пользователя пустое,
  //    бот его заполняет. Возвращаем фейковый успех, чтобы бот не понял.
  if (
    payload &&
    typeof payload === "object" &&
    typeof (payload as { website?: unknown }).website === "string" &&
    (payload as { website: string }).website.trim().length > 0
  ) {
    return NextResponse.json({ ok: true, orderId: generateOrderId() });
  }

  const validation = validateOrder(payload);
  if ("error" in validation) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400 }
    );
  }
  const order = validation.order;
  const orderId = generateOrderId();

  // Шлём во все каналы параллельно. Telegram и Sheets — как раньше; Weeek CRM
  // добавлен рядом (152-ФЗ: ПДн на серверах в РФ). Weeek — best-effort и НЕ
  // влияет на решение «принята ли заявка»: считаем заявку принятой, если
  // сработал хотя бы Telegram или Sheets (как было до Weeek).
  const [telegramResult, sheetsResult, weeekResult] = await Promise.allSettled([
    sendToTelegram(orderId, order, { paid: false }),
    sendToSheets(orderId, order, { action: "create", status: "заявка (без оплаты)" }),
    sendToWeeek(orderId, order),
  ]);

  const telegramOk = telegramResult.status === "fulfilled";
  const sheetsOk = sheetsResult.status === "fulfilled";

  if (!telegramOk) {
    console.error(
      `[checkout] Telegram failed for order ${orderId}:`,
      (telegramResult as PromiseRejectedResult).reason
    );
  }
  if (!sheetsOk) {
    console.error(
      `[checkout] Sheets failed for order ${orderId}:`,
      (sheetsResult as PromiseRejectedResult).reason
    );
  }
  if (weeekResult.status === "rejected") {
    console.error(
      `[checkout] Weeek failed for order ${orderId}:`,
      (weeekResult as PromiseRejectedResult).reason
    );
  }

  // Оба канала упали — заявка не принята, пользователь переотправит.
  if (!telegramOk && !sheetsOk) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Не удалось отправить заявку. Попробуйте ещё раз через минуту или напишите мне напрямую.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    orderId,
    channels: {
      telegram: telegramOk,
      sheets: sheetsOk,
      weeek: weeekResult.status === "fulfilled",
    },
  });
}
