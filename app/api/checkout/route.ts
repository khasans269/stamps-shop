// Серверный роут оформления заказа.
//
// Когда пользователь нажимает "Отправить заявку" на /checkout, фронт
// отправляет сюда POST с данными заказа. Этот файл — то, что выполняется
// на сервере (на Vercel). Он:
//   1) валидирует входные данные,
//   2) генерирует номер заказа,
//   3) параллельно шлёт в Telegram и в Google Sheets,
//   4) возвращает ответ фронту.
//
// Секреты (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SHEETS_WEBHOOK_URL)
// хранятся как переменные окружения в Vercel. Браузер их не видит — это
// одна из причин делать API-роут вместо прямого фетча в Telegram с фронта.
//
// Файл живёт в app/api/checkout/route.ts по правилу App Router:
//   POST /api/checkout → экспорт async function POST(request)

import { NextResponse } from "next/server";

// На Node-runtime гарантированно есть fetch и process.env. На Edge-runtime
// тоже работает, но на Edge сложнее логировать; оставляем дефолтный Node.
export const runtime = "nodejs";

// ── Типы запроса ────────────────────────────────────────────────────────────
// Дублируем shape с фронта, чтобы не тащить общий тип. Серверный роут —
// граница доверия, поэтому тип здесь нужен в первую очередь для парсинга
// и валидации, а не для шаринга с UI.

interface IncomingItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  sum: number;
}

interface IncomingOrder {
  contact: {
    name: string;
    phone: string;
    email: string;
  };
  delivery: {
    method: string;
    methodLabel: string;
    address: string;
  };
  comment: string | null;
  items: IncomingItem[];
  total: number;
}

// ── Константы ───────────────────────────────────────────────────────────────

const MIN_ORDER_TOTAL = 500;
const MAX_ITEMS = 50; // защита от мусорных заказов
const MAX_FIELD_LEN = 1000; // защита от мусорных запросов

// ── Хелперы ─────────────────────────────────────────────────────────────────

// Сгенерировать читаемый номер заказа: ДДММГГ-NNNN.
// Делается на сервере, чтобы все системы (Telegram, Sheets, success-страница)
// получили один и тот же номер.
function generateOrderId(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${dd}${mm}${yy}-${rand}`;
}

// Полу-валидация телефона/email: отвергаем совсем мусорное.
// Полная валидация уже на фронте, здесь — последняя линия обороны.
function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Безопасное получение строки из произвольного значения. Если пришло не
// строка — возвращаем пустую (дальше провалит валидацию длины).
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Экранируем для Telegram MarkdownV2. В Telegram эти символы зарезервированы;
// если их не экранировать, парсер сообщения упадёт и Telegram вернёт 400.
// Список взят из официальных доков Telegram Bot API.
function escapeMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// Форматируем сообщение для Telegram. Markdown сделан так, чтобы каждый
// блок легко читался в мобильном клиенте — короткие строки, ключи жирным.
function formatTelegramMessage(orderId: string, order: IncomingOrder): string {
  const lines: string[] = [];

  lines.push(`🛒 *Новый заказ* №${escapeMd(orderId)}`);
  lines.push("");
  lines.push("*Контакт*");
  lines.push(`Имя: ${escapeMd(order.contact.name)}`);
  lines.push(`Телефон: ${escapeMd(order.contact.phone)}`);
  lines.push(`Email: ${escapeMd(order.contact.email)}`);
  lines.push("");
  lines.push("*Доставка*");
  lines.push(`Способ: ${escapeMd(order.delivery.methodLabel)}`);
  lines.push(`Адрес: ${escapeMd(order.delivery.address)}`);
  if (order.comment) {
    lines.push("");
    lines.push("*Комментарий*");
    lines.push(escapeMd(order.comment));
  }
  lines.push("");
  lines.push("*Состав*");
  for (const item of order.items) {
    const sum = item.sum.toLocaleString("ru-RU");
    const price = item.price.toLocaleString("ru-RU");
    lines.push(
      `• ${escapeMd(item.name)} — ${item.quantity} × ${escapeMd(price)} ₽ \\= ${escapeMd(sum)} ₽`
    );
  }
  lines.push("");
  lines.push(`*Итого:* ${escapeMd(order.total.toLocaleString("ru-RU"))} ₽`);

  return lines.join("\n");
}

// ── Валидация ───────────────────────────────────────────────────────────────

// Проверяем, что входные данные имеют ожидаемую форму. Если что-то не так
// — возвращаем человекочитаемое сообщение об ошибке. Если всё ок — null.
function validateOrder(data: unknown): { error: string } | { order: IncomingOrder } {
  if (!data || typeof data !== "object") {
    return { error: "Некорректный формат запроса" };
  }
  const obj = data as Record<string, unknown>;

  const contact = obj.contact as Record<string, unknown> | undefined;
  const delivery = obj.delivery as Record<string, unknown> | undefined;
  const items = obj.items as unknown[] | undefined;

  if (!contact || !delivery || !Array.isArray(items)) {
    return { error: "Не хватает обязательных секций" };
  }

  const name = asString(contact.name).trim();
  const phone = asString(contact.phone).trim();
  const email = asString(contact.email).trim();
  if (
    name.length < 2 ||
    name.length > MAX_FIELD_LEN ||
    !isValidPhone(phone) ||
    !isValidEmail(email)
  ) {
    return { error: "Контактные данные не прошли проверку" };
  }

  const method = asString(delivery.method).trim();
  const methodLabel = asString(delivery.methodLabel).trim();
  const address = asString(delivery.address).trim();
  if (
    method.length === 0 ||
    methodLabel.length === 0 ||
    address.length < 5 ||
    address.length > MAX_FIELD_LEN
  ) {
    return { error: "Данные доставки не прошли проверку" };
  }

  if (items.length === 0 || items.length > MAX_ITEMS) {
    return { error: "Некорректный состав заказа" };
  }

  const cleanItems: IncomingItem[] = [];
  let computedTotal = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      return { error: "Некорректная позиция в заказе" };
    }
    const it = raw as Record<string, unknown>;
    const productId = asString(it.productId).trim();
    const itemName = asString(it.name).trim();
    const price = Number(it.price);
    const quantity = Number(it.quantity);
    const sum = Number(it.sum);
    if (
      !productId ||
      !itemName ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(sum) ||
      sum < 0
    ) {
      return { error: "Позиция заказа содержит некорректные значения" };
    }
    cleanItems.push({ productId, name: itemName, price, quantity, sum });
    computedTotal += price * quantity;
  }

  if (computedTotal < MIN_ORDER_TOTAL) {
    return { error: `Минимальная сумма заказа — ${MIN_ORDER_TOTAL} ₽` };
  }

  // Итоговая сумма от клиента не доверена — пересчитываем сами.
  const total = computedTotal;

  const commentRaw = obj.comment;
  const comment =
    typeof commentRaw === "string" && commentRaw.trim().length > 0
      ? commentRaw.trim().slice(0, MAX_FIELD_LEN)
      : null;

  return {
    order: {
      contact: { name, phone, email },
      delivery: { method, methodLabel, address },
      comment,
      items: cleanItems,
      total,
    },
  };
}

// ── Отправка в Telegram ─────────────────────────────────────────────────────

async function sendToTelegram(orderId: string, order: IncomingOrder): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы");
  }

  const text = formatTelegramMessage(orderId, order);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram ${res.status}: ${body.slice(0, 300)}`);
  }
}

// ── Отправка в Google Sheets ────────────────────────────────────────────────

async function sendToSheets(orderId: string, order: IncomingOrder): Promise<void> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) {
    throw new Error("SHEETS_WEBHOOK_URL не задан");
  }

  // Для Sheets отправляем плоскую структуру: одна строка таблицы =
  // один заказ. Состав сворачиваем в человекочитаемую строку, чтобы
  // в одной ячейке было понятно, что заказали.
  const itemsText = order.items
    .map(
      (it) =>
        `${it.name} — ${it.quantity} × ${it.price.toLocaleString("ru-RU")} ₽ = ${it.sum.toLocaleString("ru-RU")} ₽`
    )
    .join("\n");

  const payload = {
    orderId,
    createdAt: new Date().toISOString(),
    name: order.contact.name,
    phone: order.contact.phone,
    email: order.contact.email,
    deliveryMethod: order.delivery.methodLabel,
    address: order.delivery.address,
    comment: order.comment ?? "",
    items: itemsText,
    total: order.total,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    // Apps Script любит редиректы — позволим fetch'у идти за ними.
    redirect: "follow",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sheets ${res.status}: ${body.slice(0, 300)}`);
  }
}

// ── Сам обработчик POST /api/checkout ───────────────────────────────────────

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Не удалось разобрать JSON тела запроса" },
      { status: 400 }
    );
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

  // Шлём в оба канала параллельно. Если один упал — второй должен
  // успеть. allSettled даёт нам результат каждого по отдельности.
  const [telegramResult, sheetsResult] = await Promise.allSettled([
    sendToTelegram(orderId, order),
    sendToSheets(orderId, order),
  ]);

  const telegramOk = telegramResult.status === "fulfilled";
  const sheetsOk = sheetsResult.status === "fulfilled";

  // Логируем падения в серверный лог Vercel — там видно по вкладке Logs.
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

  // Если оба канала упали — это уже не пройдёт. Возвращаем 502 и
  // ничего не записываем как успешный заказ; пользователь увидит
  // ошибку и сможет переотправить заявку.
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

  // Иначе — заказ принят. Если один из каналов упал, всё равно
  // считаем заявку принятой — у Аскара есть данные хотя бы в одном
  // месте. Поле channels помогает позже понять, что именно дошло.
  return NextResponse.json({
    ok: true,
    orderId,
    channels: {
      telegram: telegramOk,
      sheets: sheetsOk,
    },
  });
}
