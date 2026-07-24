// Клиент Weeek CRM — отправка заказа как «сделки» в российскую CRM Weeek.
//
// Зачем это нужно: по 152-ФЗ персональные данные покупателей (имя, телефон,
// email, адрес) должны храниться на серверах в РФ. Weeek — российский сервис
// с серверами в России, поэтому заказ дублируется сюда ПАРАЛЛЕЛЬНО отправке
// в Telegram и Google Sheets (их пока не трогаем). Позже продавец решит,
// что оставить.
//
// Документация API: https://developers.weeek.net/api
//   База:        https://api.weeek.net/public/v1
//   Авторизация: заголовок Authorization: Bearer <токен>
//                (токен создаётся в Weeek: Настройки рабочего пространства →
//                 раздел «API» → «Добавить приложение»).
//
// Как создаётся сделка (по докам):
//   POST /crm/statuses/{statusId}/deals
//     body: { title, amount, description, contacts?, ... }
// То есть для создания сделки ОБЯЗАТЕЛЬНО нужен id статуса воронки (statusId).
// Чтобы от продавца требовался только токен, id воронки и стартового статуса
// определяем автоматически:
//   GET /crm/funnels                     → берём воронку (первую или по env);
//   GET /crm/funnels/{funnelId}/statuses → берём первый (стартовый) статус.
// При желании их можно зафиксировать через env WEEEK_FUNNEL_ID /
// WEEEK_FUNNEL_STEP_ID — тогда лишние GET-запросы не делаются.
//
// Контакт покупателя создаём и привязываем к сделке по возможности (best-effort):
//   POST /crm/contacts                     → создаём контакт;
//   POST /crm/contacts/{id}/emails|phones  → добавляем email/телефон;
//   POST /crm/deals/{dealId}/contacts      → привязываем к сделке.
// Даже если шаг с контактом не удастся — все ПДн уже лежат в описании сделки,
// поэтому ничего не теряется.
//
// Токен (WEEEK_API_TOKEN) хранится в переменных окружения Timeweb и НИКОГДА
// не попадает в код/браузер/git.

import { IncomingOrder } from "@/lib/order";

const WEEEK_API = "https://api.weeek.net/public/v1";

// Таймаут на запросы к Weeek. Отправка best-effort и не должна подвешивать
// оформление заказа, если CRM тормозит или недоступна.
const WEEEK_TIMEOUT_MS = 8000;

// ── Заголовок авторизации ────────────────────────────────────────────────────

function authHeader(): string {
  const token = process.env.WEEEK_API_TOKEN;
  if (!token) {
    throw new Error("WEEEK_API_TOKEN не задан");
  }
  return `Bearer ${token.trim()}`;
}

// ── Низкоуровневый запрос к API Weeek ────────────────────────────────────────
//
// Возвращает разобранный JSON. Бросает ошибку при HTTP-ошибке, не-JSON ответе
// или success:false — чтобы вызывающий код мог залогировать причину.
async function weeekFetch(
  path: string,
  init: { method: string; body?: unknown } = { method: "GET" }
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEEEK_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${WEEEK_API}${path}`, {
      method: init.method,
      headers: {
        Authorization: authHeader(),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Weeek ${init.method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Weeek ${path} вернул не JSON: ${text.slice(0, 300)}`);
  }
  if (data.success === false) {
    throw new Error(`Weeek ${path} success=false: ${text.slice(0, 500)}`);
  }
  return data;
}

// ── Авто-резолв воронки и стартового статуса ─────────────────────────────────
//
// Результат кэшируем в памяти процесса, пока функция «тёплая»: id воронки и
// статуса меняются редко, а каждый заказ иначе делал бы 2 лишних GET-запроса.
// Если продавец пересоберёт/перезапустит приложение — кэш просто заполнится
// заново при первом заказе.
interface FunnelTarget {
  funnelId: string;
  statusId: string;
}
let cachedTarget: FunnelTarget | null = null;

// Безопасно достаём строковый id из объекта неизвестной формы.
function readId(obj: unknown): string | null {
  if (obj && typeof obj === "object" && "id" in obj) {
    const id = (obj as { id: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
    if (typeof id === "number") return String(id);
  }
  return null;
}

// Достаём строковое имя (name) из объекта неизвестной формы.
function readName(obj: unknown): string {
  if (obj && typeof obj === "object" && "name" in obj) {
    const name = (obj as { name: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

async function resolveFunnelTarget(): Promise<FunnelTarget> {
  if (cachedTarget) return cachedTarget;

  // 1) Воронка. Приоритет — явный env. Иначе берём первую воронку; если среди
  //    воронок есть та, в названии которой встречается «заказ», предпочитаем её.
  let funnelId = process.env.WEEEK_FUNNEL_ID?.trim() || "";
  if (!funnelId) {
    const data = await weeekFetch("/crm/funnels");
    const funnels = Array.isArray(data.funnels) ? (data.funnels as unknown[]) : [];
    if (funnels.length === 0) {
      throw new Error("В Weeek нет ни одной воронки CRM — создайте воронку (например «Заказы с сайта»)");
    }
    const preferred = funnels.find((f) => readName(f).toLowerCase().includes("заказ"));
    funnelId = readId(preferred ?? funnels[0]) ?? "";
    if (!funnelId) {
      throw new Error("Не удалось определить id воронки из ответа Weeek");
    }
  }

  // 2) Стартовый статус воронки. Приоритет — явный env. Иначе берём ПЕРВЫЙ
  //    статус (входной этап воронки — новые сделки попадают в него).
  let statusId = process.env.WEEEK_FUNNEL_STEP_ID?.trim() || "";
  if (!statusId) {
    const data = await weeekFetch(`/crm/funnels/${encodeURIComponent(funnelId)}/statuses`);
    const statuses = Array.isArray(data.statuses) ? (data.statuses as unknown[]) : [];
    if (statuses.length === 0) {
      throw new Error(`В воронке ${funnelId} нет статусов — добавьте хотя бы один этап`);
    }
    statusId = readId(statuses[0]) ?? "";
    if (!statusId) {
      throw new Error("Не удалось определить id статуса из ответа Weeek");
    }
  }

  cachedTarget = { funnelId, statusId };
  return cachedTarget;
}

// ── Описание сделки ──────────────────────────────────────────────────────────
//
// Собираем человекочитаемое описание со всеми деталями заказа. Это ключевой
// носитель ПДн внутри Weeek: даже если привязка контакта не удастся, данные
// покупателя останутся здесь. Обычный текст с переносами строк.
function buildDealDescription(orderId: string, order: IncomingOrder): string {
  const lines: string[] = [];

  lines.push(`Заказ №${orderId}`);
  lines.push("");

  lines.push("Контакт");
  lines.push(`  Имя: ${order.contact.name}`);
  lines.push(`  Телефон: ${order.contact.phone}`);
  lines.push(`  Email: ${order.contact.email}`);
  if (order.contact.telegram) {
    lines.push(`  Telegram: ${order.contact.telegram}`);
  }
  lines.push("");

  lines.push("Доставка");
  lines.push(`  Способ: ${order.delivery.methodLabel}`);
  lines.push(`  Адрес/ПВЗ: ${order.delivery.address}`);
  if (order.delivery.pointId) {
    lines.push(`  id пункта: ${order.delivery.pointId}`);
  }
  lines.push("");

  if (order.comment) {
    lines.push("Комментарий");
    lines.push(`  ${order.comment}`);
    lines.push("");
  }

  lines.push("Состав заказа");
  for (const item of order.items) {
    const price = item.price.toLocaleString("ru-RU");
    const sum = item.sum.toLocaleString("ru-RU");
    lines.push(`  • ${item.name} — ${item.quantity} × ${price} ₽ = ${sum} ₽`);
  }
  lines.push("");

  lines.push(`Товары: ${order.itemsTotal.toLocaleString("ru-RU")} ₽`);
  lines.push(`Доставка: ${order.deliveryFee.toLocaleString("ru-RU")} ₽`);
  lines.push(`Итого: ${order.grandTotal.toLocaleString("ru-RU")} ₽`);

  return lines.join("\n");
}

// ── Создание/привязка контакта (best-effort) ─────────────────────────────────
//
// Создаём контакт покупателя и привязываем к сделке. Любой сбой на этом этапе
// не критичен (ПДн уже в описании сделки), поэтому ошибки только логируем и не
// пробрасываем наружу. Все под-шаги отдельные — если, например, не добавится
// телефон, контакт и его привязка всё равно останутся.
async function attachContactBestEffort(
  dealId: string,
  order: IncomingOrder
): Promise<void> {
  try {
    // У нас одно поле «имя» — кладём его целиком в firstName (обязательное).
    const created = await weeekFetch("/crm/contacts", {
      method: "POST",
      body: { firstName: order.contact.name.slice(0, 255) },
    });
    const contactId = readId(created.contact);
    if (!contactId) {
      console.error("[weeek] Контакт создан, но id не найден в ответе");
      return;
    }

    // Email и телефон добавляем отдельными запросами (у этих эндпоинтов
    // точно известная схема: { email } / { phone }).
    if (order.contact.email) {
      try {
        await weeekFetch(`/crm/contacts/${encodeURIComponent(contactId)}/emails`, {
          method: "POST",
          body: { email: order.contact.email },
        });
      } catch (err) {
        console.error("[weeek] Не удалось добавить email контакту:", err);
      }
    }
    if (order.contact.phone) {
      try {
        await weeekFetch(`/crm/contacts/${encodeURIComponent(contactId)}/phones`, {
          method: "POST",
          body: { phone: order.contact.phone },
        });
      } catch (err) {
        console.error("[weeek] Не удалось добавить телефон контакту:", err);
      }
    }

    // Привязываем контакт к сделке.
    await weeekFetch(`/crm/deals/${encodeURIComponent(dealId)}/contacts`, {
      method: "POST",
      body: { contactId },
    });
  } catch (err) {
    console.error("[weeek] Не удалось создать/привязать контакт:", err);
  }
}

// ── Публичная функция: отправить заказ в Weeek ───────────────────────────────
//
// Создаёт сделку в CRM Weeek:
//   title       = «Заказ №… — <сумма> ₽»
//   amount      = итог к оплате (число)
//   description = полные детали заказа (товары, доставка, ПВЗ/адрес, контакты,
//                 комментарий)
// и best-effort создаёт/привязывает контакт покупателя.
//
// Возвращает id созданной сделки. Бросает ошибку, если сделку создать не
// удалось (нет токена, недоступен API, нет воронки/статуса) — вызывающий код
// ловит её и логирует, НЕ роняя оформление заказа.
export async function sendToWeeek(
  orderId: string,
  order: IncomingOrder
): Promise<string> {
  const { statusId } = await resolveFunnelTarget();

  const title = `Заказ №${orderId} — ${order.grandTotal.toLocaleString("ru-RU")} ₽`.slice(0, 255);

  const created = await weeekFetch(`/crm/statuses/${encodeURIComponent(statusId)}/deals`, {
    method: "POST",
    body: {
      title,
      amount: order.grandTotal,
      description: buildDealDescription(orderId, order),
    },
  });

  const dealId = readId(created.deal);
  if (!dealId) {
    throw new Error("Weeek: сделка создана, но id не найден в ответе");
  }

  // Контакт — по возможности, не критично.
  await attachContactBestEffort(dealId, order);

  return dealId;
}

// ── Диагностика (для временного проверочного роута) ──────────────────────────
//
// Проверяет, что токен задан и что автоматически определяются воронка и
// стартовый статус. НЕ создаёт сделку. Используется временным роутом
// /api/weeek/ping для проверки настройки живьём на боевом домене.
export async function weeekDiagnostics(): Promise<{
  ok: boolean;
  tokenPresent: boolean;
  funnelId?: string;
  statusId?: string;
  error?: string;
}> {
  const tokenPresent = Boolean(process.env.WEEEK_API_TOKEN);
  if (!tokenPresent) {
    return { ok: false, tokenPresent: false, error: "WEEEK_API_TOKEN не задан" };
  }
  try {
    // Сбрасываем кэш, чтобы диагностика всегда реально дёргала API.
    cachedTarget = null;
    const target = await resolveFunnelTarget();
    return {
      ok: true,
      tokenPresent: true,
      funnelId: target.funnelId,
      statusId: target.statusId,
    };
  } catch (err) {
    return { ok: false, tokenPresent: true, error: String(err) };
  }
}
