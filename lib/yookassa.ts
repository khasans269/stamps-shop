// Клиент ЮKassa — тонкая обёртка над их HTTP API (v3).
//
// Документация: https://yookassa.ru/developers/api
//
// Здесь только то, что нужно магазину на этапе 1:
//   - createPayment — создать платёж и получить ссылку на оплату;
//   - getPayment    — запросить актуальный статус платежа по id (используется
//                     в webhook: телу уведомления не доверяем, а перепроверяем
//                     статус обратным запросом — так рекомендует сама ЮKassa).
//
// Ключи (YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY) хранятся в переменных
// окружения Vercel и НИКОГДА не попадают в код/браузер. Тестовый режим
// ЮKassa работает через тот же API — просто с тестовыми shopId/secret,
// поэтому отдельного «переключателя» в коде не нужно.
//
// Про деньги: ЮKassa принимает суммы строкой рублей с двумя знаками после
// точки ("1500.00"). Внутри магазина суммы — целые рубли, поэтому переводим
// их в этот формат в toAmountValue(). Копейки заводим только на этой границе.

import { IncomingOrder } from "@/lib/order";

const YOOKASSA_API = "https://api.yookassa.ru/v3";

// ── Хелперы сумм ─────────────────────────────────────────────────────────────

// Рубли (целое число или дробное) → строка "1500.00", как требует ЮKassa.
export function toAmountValue(rubles: number): string {
  return rubles.toFixed(2);
}

// ── Типы ответов ЮKassa (только нужные поля) ─────────────────────────────────

export interface YooKassaPayment {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  metadata?: Record<string, string>;
  description?: string;
}

// ── Basic Auth ───────────────────────────────────────────────────────────────

function authHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) {
    throw new Error("YOOKASSA_SHOP_ID или YOOKASSA_SECRET_KEY не заданы");
  }
  // Basic base64(shopId:secretKey).
  const token = Buffer.from(`${shopId}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

// ── Чек для самозанятого (54-ФЗ / автосервис ЮKassa) ─────────────────────────
//
// Чек включаем только если YOOKASSA_SEND_RECEIPT="true". Пока у продавца
// не подключён автосервис чеков для самозанятых, флаг держим выключенным —
// тогда receipt не передаём, а чек пробивается вручную в «Мой налог».
// Когда автосервис подключат — ставим флаг в "true".
//
// Формат чека: одна позиция на каждый товар + отдельная позиция «Доставка».
// Вся сумма — доход самозанятого (доставка как услуга не выделяется как
// отдельный тариф, но в чеке 54-ФЗ позиции всё равно перечисляются).
//
// ВНИМАНИЕ: точные значения vat_code / payment_subject / payment_mode для
// самозанятого нужно свериться в личном кабинете ЮKassa при подключении
// автосервиса — у разных схем они отличаются. Значения ниже — типовые для
// «без НДС» (самозанятые НДС не платят). См. docs/payments-setup.md.
function buildReceipt(order: IncomingOrder): object | undefined {
  if (process.env.YOOKASSA_SEND_RECEIPT !== "true") {
    return undefined;
  }

  const items = order.items.map((item) => ({
    description: item.name.slice(0, 128), // ограничение ЮKassa на длину
    quantity: item.quantity.toFixed(2),
    amount: { value: toAmountValue(item.price), currency: "RUB" },
    vat_code: 1, // 1 = без НДС
    payment_subject: "commodity", // товар
    payment_mode: "full_payment", // полный расчёт
  }));

  if (order.deliveryFee > 0) {
    items.push({
      description: "Доставка",
      quantity: (1).toFixed(2),
      amount: { value: toAmountValue(order.deliveryFee), currency: "RUB" },
      vat_code: 1,
      payment_subject: "service", // услуга
      payment_mode: "full_payment",
    });
  }

  // Контакт для отправки чека покупателю: email обязателен (телефон опц.).
  const customer: Record<string, string> = { email: order.contact.email };

  return { customer, items };
}

// ── Создание платежа ─────────────────────────────────────────────────────────
//
// idempotenceKey — обязательный уникальный ключ на каждую попытку создания
// платежа (uuid). Защищает от задвоения платежа при сетевых ретраях.
// returnUrl — куда ЮKassa вернёт покупателя после оплаты (страница success).
export async function createPayment(params: {
  order: IncomingOrder;
  orderId: string;
  idempotenceKey: string;
  returnUrl: string;
}): Promise<YooKassaPayment> {
  const { order, orderId, idempotenceKey, returnUrl } = params;

  const body: Record<string, unknown> = {
    amount: {
      value: toAmountValue(order.grandTotal),
      currency: "RUB",
    },
    // capture:true — одностадийный платёж: деньги списываются сразу после
    // подтверждения покупателем (без отдельного «захвата»).
    capture: true,
    confirmation: {
      type: "redirect",
      return_url: returnUrl,
    },
    description: `Заказ №${orderId}`.slice(0, 128),
    // metadata — наши служебные данные. Вернутся в webhook. Кладём минимум,
    // которого хватит на короткое уведомление об оплате (имя, телефон,
    // сумма) и на сверку по orderId с записью в Google Sheets. Полный состав
    // заказа в metadata не кладём — там лимит на размер значений, а детали
    // и так лежат в предзаписи Sheets «ожидает оплаты».
    // Значения metadata — только строки.
    metadata: {
      orderId,
      customerName: order.contact.name.slice(0, 100),
      customerPhone: order.contact.phone.slice(0, 20),
      total: String(order.grandTotal),
    },
  };

  const receipt = buildReceipt(order);
  if (receipt) {
    body.receipt = receipt;
  }

  const res = await fetch(`${YOOKASSA_API}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`ЮKassa create payment ${res.status}: ${text.slice(0, 500)}`);
  }

  let data: YooKassaPayment;
  try {
    data = JSON.parse(text) as YooKassaPayment;
  } catch {
    throw new Error(`ЮKassa вернула не JSON: ${text.slice(0, 500)}`);
  }
  return data;
}

// ── Запрос статуса платежа по id ─────────────────────────────────────────────
//
// Используется в webhook: телу уведомления не доверяем напрямую, а делаем
// обратный GET по payment.id, чтобы подтвердить реальный статус. Так
// рекомендует сама ЮKassa (защита от поддельных уведомлений).
export async function getPayment(paymentId: string): Promise<YooKassaPayment> {
  const res = await fetch(`${YOOKASSA_API}/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      Authorization: authHeader(),
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`ЮKassa get payment ${res.status}: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text) as YooKassaPayment;
  } catch {
    throw new Error(`ЮKassa вернула не JSON: ${text.slice(0, 500)}`);
  }
}
