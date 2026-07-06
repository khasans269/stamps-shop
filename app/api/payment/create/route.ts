// Создание платежа в ЮKassa — основной флоу оформления заказа.
//
// Форма чекаута шлёт сюда POST с данными заказа. Роут:
//   1) проверяет origin и honeypot (как в старом /api/checkout);
//   2) валидирует заказ и пересчитывает суммы (товары + фикс доставки);
//   3) записывает предзаказ в Google Sheets со статусом «ожидает оплаты» —
//      чтобы даже при сбое webhook оплаченный заказ не потерялся;
//   4) создаёт платёж в ЮKassa и возвращает ссылку на оплату
//      (confirmation_url), куда фронт редиректит покупателя.
//
// Уведомление в Telegram шлётся НЕ здесь, а после подтверждения оплаты
// (webhook), чтобы продавца не заваливало неоплаченными заявками.
//
// Файл: app/api/payment/create/route.ts → POST /api/payment/create

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  generateOrderId,
  isAllowedOrigin,
  sendToSheets,
  validateOrder,
} from "@/lib/order";
import { createPayment } from "@/lib/yookassa";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // 1) Origin-проверка.
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

  // 2) Honeypot. Скрытое поле "website" непустое → это бот. Возвращаем
  //    правдоподобный ответ без реального платежа: даём фейковый
  //    confirmation_url на нашу же success-страницу.
  if (
    payload &&
    typeof payload === "object" &&
    typeof (payload as { website?: unknown }).website === "string" &&
    (payload as { website: string }).website.trim().length > 0
  ) {
    const base = origin ?? "";
    return NextResponse.json({
      ok: true,
      orderId: generateOrderId(),
      confirmationUrl: `${base}/checkout/success`,
    });
  }

  // 3) Валидация и пересчёт сумм на сервере.
  const validation = validateOrder(payload);
  if ("error" in validation) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400 }
    );
  }
  const order = validation.order;
  const orderId = generateOrderId();

  // return_url: куда ЮKassa вернёт покупателя после оплаты. Берём наш origin
  // (он уже проверен) + страница успеха с номером заказа.
  const returnUrl = `${origin}/checkout/success?order=${encodeURIComponent(orderId)}`;

  // 4) Предзапись в Sheets «ожидает оплаты». Если не удастся — платёж всё
  //    равно создаём (не блокируем покупателя), но громко логируем: это
  //    значит, что при успешной оплате полные детали заказа окажутся только
  //    в письме/ЛК ЮKassa, и нужно чинить Sheets.
  let sheetsPreOk = true;
  try {
    await sendToSheets(orderId, order, {
      action: "create",
      status: "ожидает оплаты",
    });
  } catch (err) {
    sheetsPreOk = false;
    console.error(`[payment/create] Sheets pre-write failed for ${orderId}:`, err);
  }

  // 5) Создание платежа в ЮKassa.
  try {
    const payment = await createPayment({
      order,
      orderId,
      idempotenceKey: randomUUID(), // уникальный ключ на каждую попытку
      returnUrl,
    });

    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      console.error(
        `[payment/create] Нет confirmation_url в ответе ЮKassa для ${orderId}:`,
        payment
      );
      return NextResponse.json(
        {
          ok: false,
          error:
            "Не удалось создать платёж. Попробуйте ещё раз через минуту или напишите мне напрямую.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      orderId,
      paymentId: payment.id,
      confirmationUrl,
      // Служебно — чтобы в логах/отладке видеть, записался ли предзаказ.
      sheetsPreWrite: sheetsPreOk,
    });
  } catch (err) {
    console.error(`[payment/create] ЮKassa create failed for ${orderId}:`, err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Не удалось создать платёж. Попробуйте ещё раз через минуту или напишите мне напрямую.",
      },
      { status: 502 }
    );
  }
}
