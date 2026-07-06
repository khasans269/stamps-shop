// Общая логика заказа: типы, валидация, генерация номера и отправка
// уведомлений в Telegram и Google Sheets.
//
// Раньше всё это лежало прямо в app/api/checkout/route.ts. Теперь, когда
// появилась оплата (ЮKassa), эти же функции нужны в двух местах:
//   - /api/payment/create  — записывает предзаказ «ожидает оплаты»;
//   - /api/payment/webhook — после успешной оплаты шлёт финальное
//                            уведомление в Telegram и обновляет Sheets.
// Поэтому логика вынесена сюда, чтобы не дублировать её и не разъезжаться.
//
// Важно про деньги: внутри всей серверной логики суммы в РУБЛЯХ целыми
// числами (у товаров цена без копеек, доставка — фикс в рублях). В копейки
// переводим только на границе с ЮKassa (см. lib/yookassa.ts), а рубли с
// копейками показываем лишь в UI. Так меньше риска ошибок округления.

import { allProducts } from "@/lib/products";

// ── Константы ───────────────────────────────────────────────────────────────

export const MIN_ORDER_TOTAL = 500; // минимальная сумма товаров, ₽
export const MAX_ITEMS = 50; // защита от мусорных заказов
export const MAX_FIELD_LEN = 1000; // защита от мусорных запросов

// Способ доставки «самовывоз». При нём доставка бесплатна, а адрес
// покупателю вводить не нужно — показываем адрес пункта. Значение должно
// совпадать с value в DELIVERY_OPTIONS на форме (CheckoutClient.tsx).
export const PICKUP_METHOD = "pickup";
export const PICKUP_ADDRESS =
  "Самовывоз: Санкт-Петербург, ст. м. Пионерская (адрес и время согласую по телефону)";

// Способ «СДЭК ПВЗ» — с онлайн-расчётом стоимости через виджет СДЭК.
// Значение совпадает с CDEK_PVZ_VALUE на форме (CheckoutClient.tsx). Цену
// считает виджет на клиенте, сервер её санитизирует (см. validateOrder).
export const CDEK_PVZ_METHOD = "cdek-pvz";

// Фикс-стоимость доставки в рублях. Берётся из переменной окружения
// DELIVERY_FLAT_FEE (её задаёт продавец в Vercel), чтобы менять цену
// доставки без правки кода и передеплоя. Если переменная не задана или
// кривая — считаем доставку 0 ₽ (лучше не доплачивать за клиента молча,
// чем упасть; в проде переменная должна быть выставлена).
export function getDeliveryFlatFee(): number {
  const raw = process.env.DELIVERY_FLAT_FEE;
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  // Округляем до целых рублей — копейки в фиксе не нужны.
  return Math.round(value);
}

// ── Типы заказа ──────────────────────────────────────────────────────────────
// Серверный роут — граница доверия, поэтому типы тут нужны в первую очередь
// для парсинга и валидации входных данных, а не для шаринга с UI.

export interface IncomingItem {
  productId: string;
  name: string;
  price: number; // ₽ за штуку
  quantity: number;
  sum: number; // ₽ за позицию (price × quantity)
}

export interface OrderContact {
  name: string;
  phone: string;
  email: string;
  // Опциональный Telegram-ник в формате "@username". Если не указан — null.
  telegram: string | null;
}

export interface OrderDelivery {
  method: string;
  methodLabel: string;
  address: string;
  // id пункта выдачи Яндекса (только для способа yandex-pvz). По нему сервер
  // пересчитывает стоимость доставки. Для остальных способов — null.
  pointId?: string | null;
}

export interface IncomingOrder {
  contact: OrderContact;
  delivery: OrderDelivery;
  comment: string | null;
  items: IncomingItem[];
  // Сумма товаров, ₽ (без доставки). Пересчитывается на сервере,
  // клиенту не доверяем.
  itemsTotal: number;
  // Фикс-стоимость доставки, ₽ (getDeliveryFlatFee на момент создания заказа).
  deliveryFee: number;
  // Итог к оплате = itemsTotal + deliveryFee, ₽.
  grandTotal: number;
}

// ── Origin-проверка ──────────────────────────────────────────────────────────
// Браузер сам ставит заголовок Origin при POST с другого сайта; «голый»
// curl обычно его не ставит. Дешёвая защита от чужих ботов. На localhost
// пускаем (разработка), на *.vercel.app — прод и preview-деплои.
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (hostname === "localhost") {
      return protocol === "http:" || protocol === "https:";
    }
    if (protocol !== "https:") return false;
    if (hostname.endsWith(".vercel.app")) return true;
    // TODO: когда появится свой домен — добавить здесь:
    // if (hostname === "stamps.example.ru") return true;
    return false;
  } catch {
    return false;
  }
}

// ── Хелперы ─────────────────────────────────────────────────────────────────

// Читаемый номер заказа: ДДММГГ-NNNN. Генерируется на сервере, чтобы все
// системы (ЮKassa metadata, Telegram, Sheets, success-страница) получили
// один и тот же номер.
export function generateOrderId(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  // Время до секунды + 2 случайные цифры. Совпадение возможно лишь у двух
  // заказов в одну и ту же секунду с одинаковым «хвостом» — практически
  // исключено. Полную гарантию уникальности дала бы только база данных.
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const rand = Math.floor(10 + Math.random() * 90); // 2 цифры
  return `${dd}${mm}${yy}-${hh}${mi}${ss}-${rand}`;
}

// Полу-валидация телефона/email: отвергаем совсем мусорное. Полная
// валидация уже на фронте, здесь — последняя линия обороны.
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Безопасное получение строки из произвольного значения.
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Экранируем для Telegram MarkdownV2 — эти символы там зарезервированы,
// без экранирования Telegram вернёт 400. Список из офиц. доков Bot API.
function escapeMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// ── Форматирование сообщения для Telegram ────────────────────────────────────

// paid=false — предварительное уведомление (заказ создан, ждём оплату).
// paid=true  — заказ оплачен (шлём после webhook payment.succeeded).
export function formatTelegramMessage(
  orderId: string,
  order: IncomingOrder,
  opts: { paid: boolean; paymentId?: string } = { paid: false }
): string {
  const lines: string[] = [];

  const header = opts.paid ? "✅ *Заказ оплачен*" : "🛒 *Новый заказ (ожидает оплаты)*";
  lines.push(`${header} №${escapeMd(orderId)}`);
  lines.push("");
  lines.push("*Контакт*");
  lines.push(`Имя: ${escapeMd(order.contact.name)}`);
  lines.push(`Телефон: ${escapeMd(order.contact.phone)}`);
  lines.push(`Email: ${escapeMd(order.contact.email)}`);
  if (order.contact.telegram) {
    lines.push(`Telegram: ${escapeMd(order.contact.telegram)}`);
  }
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
  lines.push(
    `Товары: ${escapeMd(order.itemsTotal.toLocaleString("ru-RU"))} ₽`
  );
  lines.push(
    `Доставка: ${escapeMd(order.deliveryFee.toLocaleString("ru-RU"))} ₽`
  );
  lines.push(
    `*Итого к оплате:* ${escapeMd(order.grandTotal.toLocaleString("ru-RU"))} ₽`
  );
  if (opts.paymentId) {
    lines.push("");
    lines.push(`ЮKassa payment id: ${escapeMd(opts.paymentId)}`);
  }

  return lines.join("\n");
}

// ── Короткое уведомление об оплате ───────────────────────────────────────────
//
// После оплаты webhook знает лишь минимум из metadata платежа (полные детали
// заказа читать из Sheets нельзя — Apps Script только пишет). Поэтому паём
// финальное «оплачено» с ключевыми полями, а полный состав продавец смотрит
// в строке заказа в таблице (она записана заранее со статусом «ожидает оплаты»).

export interface PaidSummary {
  name: string;
  phone: string;
  total: number; // итог к оплате, ₽
  paymentId: string;
}

function formatPaidTelegramMessage(orderId: string, s: PaidSummary): string {
  const lines: string[] = [];
  lines.push(`✅ *Заказ оплачен* №${escapeMd(orderId)}`);
  lines.push("");
  lines.push(`Покупатель: ${escapeMd(s.name)}`);
  lines.push(`Телефон: ${escapeMd(s.phone)}`);
  lines.push(`Сумма: ${escapeMd(s.total.toLocaleString("ru-RU"))} ₽`);
  lines.push("");
  lines.push(escapeMd("Полный состав заказа — в таблице заказов (Google Sheets)."));
  lines.push(`ЮKassa payment id: ${escapeMd(s.paymentId)}`);
  lines.push("");
  // Автосервис чеков для самозанятых в ЮKassa пока недоступен, поэтому
  // напоминаем пробить чек вручную в «Мой налог».
  lines.push(
    escapeMd(`❗ Не забудь пробить чек в «Мой налог» на ${s.total.toLocaleString("ru-RU")} ₽.`)
  );
  return lines.join("\n");
}

// Низкоуровневая отправка текста в Telegram (используется обоими форматами).
async function sendTelegramText(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы");
  }
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

// Уведомление об успешной оплате (короткое, из данных metadata платежа).
export async function sendPaidTelegram(
  orderId: string,
  summary: PaidSummary
): Promise<void> {
  await sendTelegramText(formatPaidTelegramMessage(orderId, summary));
}

// Обновить статус ранее записанного заказа в Google Sheets. Шлём минимум —
// Apps Script находит строку по orderId и меняет статус/paymentId
// (см. docs/payments-setup.md). Если update не поддержан — добавится строка.
export async function updateOrderStatusInSheets(params: {
  orderId: string;
  status: string;
  paymentId?: string | null;
}): Promise<void> {
  const rawUrl = process.env.SHEETS_WEBHOOK_URL;
  if (!rawUrl) {
    throw new Error("SHEETS_WEBHOOK_URL не задан");
  }
  const url = rawUrl.trim();
  const payload = {
    action: "update",
    orderId: params.orderId,
    status: params.status,
    paymentId: params.paymentId ?? "",
    updatedAt: new Date().toISOString(),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Sheets HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
  }
  const lower = bodyText.toLowerCase();
  if (
    lower.includes("<!doctype") ||
    lower.includes("<html") ||
    lower.includes('"error"') ||
    lower.includes("script function not found")
  ) {
    throw new Error(
      `Sheets вернул не JSON-успех (host=${new URL(url).host}): ${bodyText.slice(0, 500)}`
    );
  }
}

// ── Валидация входящего заказа ───────────────────────────────────────────────
// Проверяем форму данных и пересчитываем суммы. При успехе возвращаем
// нормализованный заказ уже с itemsTotal / deliveryFee / grandTotal.
export function validateOrder(
  data: unknown
): { error: string } | { order: IncomingOrder } {
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

  // Telegram-ник опционален. Ещё раз почистим на всякий случай и обрежем.
  const tgRaw = contact.telegram;
  let telegram: string | null = null;
  if (typeof tgRaw === "string") {
    const cleaned = tgRaw
      .trim()
      .replace(/^@+/, "")
      .replace(/[^A-Za-z0-9_]/g, "")
      .slice(0, 64);
    telegram = cleaned ? `@${cleaned}` : null;
  }

  const method = asString(delivery.method).trim();
  const methodLabel = asString(delivery.methodLabel).trim();
  let address = asString(delivery.address).trim();
  const isPickup = method === PICKUP_METHOD;
  if (method.length === 0 || methodLabel.length === 0) {
    return { error: "Данные доставки не прошли проверку" };
  }
  if (isPickup) {
    // Самовывоз: адрес вводить не нужно — подставляем адрес пункта.
    address = PICKUP_ADDRESS;
  } else if (address.length < 5 || address.length > MAX_FIELD_LEN) {
    return { error: "Данные доставки не прошли проверку" };
  }

  // id пункта выдачи Яндекса (только для yandex-pvz).
  const pointIdRaw = delivery.pointId;
  const pointId =
    typeof pointIdRaw === "string" && pointIdRaw.trim().length > 0
      ? pointIdRaw.trim().slice(0, 128)
      : null;

  if (items.length === 0 || items.length > MAX_ITEMS) {
    return { error: "Некорректный состав заказа" };
  }

  const cleanItems: IncomingItem[] = [];
  let itemsTotal = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      return { error: "Некорректная позиция в заказе" };
    }
    const it = raw as Record<string, unknown>;
    const productId = asString(it.productId).trim();
    const quantity = Number(it.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      return { error: "Позиция заказа содержит некорректные значения" };
    }
    // Цену и название берём из products.json по productId — НЕ доверяем
    // тому, что прислал браузер. Иначе покупатель мог бы подменить цену в
    // запросе и оплатить меньше. Это ключевая проверка целостности заказа.
    const product = allProducts.find((p) => p.id === productId);
    if (!product) {
      return { error: "Товар не найден" };
    }
    const price = product.price;
    const sum = price * quantity;
    cleanItems.push({ productId, name: product.name, price, quantity, sum });
    itemsTotal += sum;
  }

  if (itemsTotal < MIN_ORDER_TOTAL) {
    return { error: `Минимальная сумма заказа — ${MIN_ORDER_TOTAL} ₽` };
  }

  const commentRaw = obj.comment;
  const comment =
    typeof commentRaw === "string" && commentRaw.trim().length > 0
      ? commentRaw.trim().slice(0, MAX_FIELD_LEN)
      : null;

  // Стоимость доставки:
  //  • самовывоз — 0;
  //  • СДЭК ПВЗ — цена, посчитанная виджетом СДЭК на клиенте
  //    (санитизируем: неотрицательное число в разумных пределах). Если
  //    значение кривое — откатываемся на фикс из env;
  //  • остальные способы — фикс из env.
  let deliveryFee: number;
  if (isPickup) {
    deliveryFee = 0;
  } else if (method === CDEK_PVZ_METHOD) {
    const dp = Number(delivery.deliveryPrice);
    deliveryFee =
      Number.isFinite(dp) && dp >= 0 && dp <= 100000
        ? Math.round(dp)
        : getDeliveryFlatFee();
  } else {
    deliveryFee = getDeliveryFlatFee();
  }
  const grandTotal = itemsTotal + deliveryFee;

  return {
    order: {
      contact: { name, phone, email, telegram },
      delivery: { method, methodLabel, address, pointId },
      comment,
      items: cleanItems,
      itemsTotal,
      deliveryFee,
      grandTotal,
    },
  };
}

// ── Отправка в Telegram ─────────────────────────────────────────────────────

export async function sendToTelegram(
  orderId: string,
  order: IncomingOrder,
  opts: { paid: boolean; paymentId?: string } = { paid: false }
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы");
  }

  const text = formatTelegramMessage(orderId, order, opts);
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
//
// Apps Script продавца ждёт вложенную структуру (data.contact.name,
// data.delivery.methodLabel, data.items как массив). Мы шлём заказ в том же
// виде плюс служебные поля:
//   action   — "create" (новая строка) или "update" (обновить статус строки
//              с тем же orderId). Apps Script по этому полю решает, добавлять
//              строку или менять существующую.
//   status   — "ожидает оплаты" | "оплачено" | "отменён".
//   paymentId — id платежа в ЮKassa (для сверки в личном кабинете).
//
// ВАЖНО: чтобы update реально обновлял строку, Apps Script нужно доработать
// (см. docs/payments-setup.md). Если он этого пока не умеет — update просто
// добавит вторую строку; данные всё равно не потеряются.
export async function sendToSheets(
  orderId: string,
  order: IncomingOrder,
  opts: {
    action: "create" | "update";
    status: string;
    paymentId?: string | null;
  }
): Promise<void> {
  const rawUrl = process.env.SHEETS_WEBHOOK_URL;
  if (!rawUrl) {
    throw new Error("SHEETS_WEBHOOK_URL не задан");
  }
  const url = rawUrl.trim();

  const payload = {
    action: opts.action,
    status: opts.status,
    paymentId: opts.paymentId ?? "",
    orderId,
    createdAt: new Date().toISOString(),
    contact: order.contact,
    delivery: order.delivery,
    comment: order.comment ?? "",
    items: order.items,
    itemsTotal: order.itemsTotal,
    deliveryFee: order.deliveryFee,
    total: order.grandTotal,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Sheets HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
  }

  // Apps Script Web App может вернуть HTML-страницу ошибки/авторизации с
  // кодом 200 — считаем это сбоем.
  const lower = bodyText.toLowerCase();
  if (
    lower.includes("<!doctype") ||
    lower.includes("<html") ||
    lower.includes('"error"') ||
    lower.includes("script function not found")
  ) {
    throw new Error(
      `Sheets вернул не JSON-успех (host=${new URL(url).host}): ${bodyText.slice(0, 500)}`
    );
  }
}
