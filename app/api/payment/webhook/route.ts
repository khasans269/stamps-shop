// Webhook ЮKassa — сюда ЮKassa шлёт уведомления о смене статуса платежа.
//
// URL этого роута нужно указать в личном кабинете ЮKassa (или подписаться
// на события через API). События: payment.succeeded, payment.canceled,
// refund.succeeded.
//
// Безопасность (телу уведомления не доверяем напрямую):
//   1) Проверяем, что запрос пришёл с IP-адресов ЮKassa (allowlist).
//   2) Главное — делаем обратный GET по payment.id через API ЮKassa и
//      смотрим НАСТОЯЩИЙ статус. Реагируем только на подтверждённый статус.
// Так рекомендует сама ЮKassa: подделать тело уведомления можно, а вот
// подтверждённый нашим же ключом статус из их API — нет.
//
// На payment.succeeded:
//   - шлём продавцу в Telegram короткое «заказ оплачен» (данные из metadata);
//   - обновляем статус заказа в Google Sheets на «оплачено».
//
// Всегда отвечаем ЮKassa 200 (кроме явно чужих запросов), иначе ЮKassa
// будет повторять уведомление. Но реальные действия делаем только по
// подтверждённому статусу. Все события логируем.
//
// Файл: app/api/payment/webhook/route.ts → POST /api/payment/webhook

import { NextResponse } from "next/server";
import {
  sendPaidTelegram,
  updateOrderStatusInSheets,
  type PaidSummary,
} from "@/lib/order";
import { getPayment } from "@/lib/yookassa";

export const runtime = "nodejs";

// Диапазоны IP-адресов, с которых ЮKassa шлёт уведомления (из их доков).
// Проверка «на скорую руку»: главная защита — обратный GET статуса ниже.
// IPv4 — в CIDR или как одиночные адреса; IPv6 — по префиксу.
const YOOKASSA_IPV4_CIDRS: Array<[string, number]> = [
  ["185.71.76.0", 27],
  ["185.71.77.0", 27],
  ["77.75.153.0", 25],
  ["77.75.154.128", 25],
];
const YOOKASSA_IPV4_SINGLE = new Set(["77.75.156.11", "77.75.156.35"]);
const YOOKASSA_IPV6_PREFIX = "2a02:5180:"; // 2a02:5180::/32

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const oct = Number(p);
    if (!Number.isInteger(oct) || oct < 0 || oct > 255) return null;
    n = (n << 8) | oct;
  }
  return n >>> 0;
}

function isYooKassaIp(ip: string | null): boolean {
  if (!ip) return false;
  // Нормализуем IPv6-mapped IPv4 (::ffff:1.2.3.4) и берём первый адрес,
  // если в заголовке список (через запятую).
  const clean = ip.split(",")[0].trim().replace(/^::ffff:/i, "");

  if (clean.includes(":")) {
    return clean.toLowerCase().startsWith(YOOKASSA_IPV6_PREFIX);
  }

  if (YOOKASSA_IPV4_SINGLE.has(clean)) return true;

  const ipInt = ipv4ToInt(clean);
  if (ipInt === null) return false;
  for (const [base, bits] of YOOKASSA_IPV4_CIDRS) {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((ipInt & mask) === (baseInt & mask)) return true;
  }
  return false;
}

// Достаём IP отправителя. На Vercel реальный клиентский IP — в
// x-forwarded-for (первый в списке).
function getClientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd;
  return request.headers.get("x-real-ip");
}

interface WebhookBody {
  type?: string; // "notification"
  event?: string; // "payment.succeeded" | "payment.canceled" | "refund.succeeded"
  object?: {
    id?: string;
    status?: string;
    metadata?: Record<string, string>;
  };
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    console.error("[payment/webhook] Не удалось разобрать JSON тела");
    // Отдаём 200, чтобы ЮKassa не долбила ретраями кривой запрос.
    return NextResponse.json({ ok: true });
  }

  console.log(
    `[payment/webhook] event=${body.event} paymentId=${body.object?.id} ip=${ip}`
  );

  // Проверка IP. Если IP не из диапазонов ЮKassa — почти наверняка чужой
  // запрос. Логируем и отвечаем 200, но ничего не делаем.
  if (!isYooKassaIp(ip)) {
    console.warn(`[payment/webhook] IP не из диапазонов ЮKassa: ${ip} — игнор`);
    return NextResponse.json({ ok: true });
  }

  const paymentId = body.object?.id;
  if (!paymentId) {
    console.warn("[payment/webhook] В уведомлении нет payment id — игнор");
    return NextResponse.json({ ok: true });
  }

  // Главная проверка: запрашиваем реальный статус платежа у ЮKassa.
  // Телу уведомления не доверяем — источник истины здесь.
  let payment;
  try {
    payment = await getPayment(paymentId);
  } catch (err) {
    console.error(`[payment/webhook] getPayment(${paymentId}) упал:`, err);
    // Отдаём 500 — пусть ЮKassa повторит уведомление позже, когда их API
    // (или наши ключи) снова будут доступны.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const orderId = payment.metadata?.orderId ?? "неизвестен";

  // Реагируем на подтверждённый статус, а не на event из тела.
  if (payment.status === "succeeded" && payment.paid) {
    const summary: PaidSummary = {
      name: payment.metadata?.customerName ?? "—",
      phone: payment.metadata?.customerPhone ?? "—",
      total: Number(payment.metadata?.total ?? payment.amount?.value ?? 0),
      paymentId,
    };

    const [tg, sheets] = await Promise.allSettled([
      sendPaidTelegram(orderId, summary),
      updateOrderStatusInSheets({ orderId, status: "оплачено", paymentId }),
    ]);
    if (tg.status === "rejected") {
      console.error(
        `[payment/webhook] Telegram (paid) failed for ${orderId}:`,
        (tg as PromiseRejectedResult).reason
      );
    }
    if (sheets.status === "rejected") {
      console.error(
        `[payment/webhook] Sheets update failed for ${orderId}:`,
        (sheets as PromiseRejectedResult).reason
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (payment.status === "canceled") {
    console.log(`[payment/webhook] Платёж ${paymentId} (${orderId}) отменён`);
    try {
      await updateOrderStatusInSheets({ orderId, status: "отменён", paymentId });
    } catch (err) {
      console.error(`[payment/webhook] Sheets update (canceled) failed:`, err);
    }
    return NextResponse.json({ ok: true });
  }

  // refund.succeeded или прочие статусы — пока просто логируем.
  if (body.event === "refund.succeeded") {
    console.log(`[payment/webhook] Возврат по платежу ${paymentId} (${orderId})`);
    try {
      await updateOrderStatusInSheets({ orderId, status: "возврат", paymentId });
    } catch (err) {
      console.error(`[payment/webhook] Sheets update (refund) failed:`, err);
    }
    return NextResponse.json({ ok: true });
  }

  console.log(
    `[payment/webhook] Статус ${payment.status} по ${paymentId} — без действий`
  );
  return NextResponse.json({ ok: true });
}
