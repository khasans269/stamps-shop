// Google Apps Script для приёма заказов магазина stamps-shop в Google-таблицу.
// Даёт значение для переменной SHEETS_WEBHOOK_URL.
//
// Как подключить (в СУЩЕСТВУЮЩУЮ таблицу):
//   1. Открой свою Google-таблицу.
//   2. Расширения → Apps Script. Удали пример кода, вставь ВЕСЬ этот файл.
//   3. Сохрани (значок дискеты).
//   Скрипт пишет в отдельную вкладку «Заказы» (создаёт её сам) — остальные
//   листы таблицы он не трогает.
//   4. Развернуть → Новое развёртывание → тип «Веб-приложение».
//        • Описание: любое.
//        • Выполнять от имени: Я.
//        • У кого есть доступ: Все (Anyone).
//      Нажми «Развернуть», разреши доступ к аккаунту, скопируй URL вида
//      https://script.google.com/macros/s/XXXX/exec  — это и есть SHEETS_WEBHOOK_URL.
//
// Заголовки колонок создаются автоматически при первом заказе.

const HEADERS = [
  "Дата",
  "Номер заказа",
  "Статус",
  "Payment ID",
  "Имя",
  "Телефон",
  "Email",
  "Telegram",
  "Доставка",
  "Адрес / ПВЗ",
  "Код ПВЗ",
  "Товары",
  "Сумма товаров",
  "Доставка, ₽",
  "Итого",
  "Комментарий",
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getSheet_();
    if (data.action === "update") {
      updateRow_(sheet, data);
    } else {
      appendRow_(sheet, data);
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, message: String(err) });
  }
}

// Отдельная вкладка «Заказы» в текущей таблице. Если её нет — создаём.
// Другие листы таблицы не затрагиваются. При пустой вкладке добавляем
// строку заголовков.
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Заказы");
  if (!sheet) {
    sheet = ss.insertSheet("Заказы");
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

// Новый заказ — добавляем строку.
function appendRow_(sheet, d) {
  const c = d.contact || {};
  const del = d.delivery || {};
  const items = (d.items || [])
    .map(function (i) {
      return i.quantity + "× " + i.name + " (" + i.sum + "₽)";
    })
    .join("\n");
  sheet.appendRow([
    d.createdAt || new Date().toISOString(),
    d.orderId || "",
    d.status || "",
    d.paymentId || "",
    c.name || "",
    c.phone || "",
    c.email || "",
    c.telegram || "",
    del.methodLabel || del.method || "",
    del.address || "",
    del.pointId || "",
    items,
    d.itemsTotal || "",
    d.deliveryFee || "",
    d.total || "",
    d.comment || "",
  ]);
}

// Обновление статуса — ищем строку по номеру заказа и меняем Статус/Payment ID.
function updateRow_(sheet, d) {
  const values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    // Колонка B (индекс 1) — номер заказа.
    if (String(values[r][1]) === String(d.orderId)) {
      sheet.getRange(r + 1, 3).setValue(d.status || ""); // C — Статус
      sheet.getRange(r + 1, 4).setValue(d.paymentId || ""); // D — Payment ID
      return;
    }
  }
  // Строку не нашли — добавим как новую, чтобы данные не потерялись.
  appendRow_(sheet, d);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
