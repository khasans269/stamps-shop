// Список ПВЗ Яндекс Доставки по адресу/городу покупателя.
//
// Форма чекаута шлёт сюда адрес → определяем населённый пункт (geo_id) →
// возвращаем список пунктов выдачи. Токен Яндекса живёт только на сервере.
//
// Если модуль доставки не настроен (нет токена) — отвечаем
// { ok: true, configured: false }, и фронт спокойно показывает запасной
// вариант («рассчитаю отдельно»), ничего не ломая.
//
// Файл: app/api/delivery/points/route.ts → POST /api/delivery/points

import { NextResponse } from "next/server";
import { isAllowedOrigin } from "@/lib/order";
import {
  detectGeoId,
  isConfigured,
  listPickupPoints,
} from "@/lib/yandex-delivery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAllowedOrigin(request.headers.get("origin"))) {
    return NextResponse.json({ ok: false, error: "Запрос не разрешён" }, { status: 403 });
  }

  // Не настроено — не ошибка, просто сообщаем фронту.
  if (!isConfigured()) {
    return NextResponse.json({ ok: true, configured: false, points: [] });
  }

  let body: { address?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный JSON" }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (address.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Укажите город или адрес" },
      { status: 400 }
    );
  }

  try {
    const detected = await detectGeoId(address);
    if (!detected) {
      return NextResponse.json({
        ok: true,
        configured: true,
        points: [],
        message: "Не удалось определить город по адресу. Уточните запрос.",
      });
    }

    const points = await listPickupPoints(detected.geoId);
    return NextResponse.json({
      ok: true,
      configured: true,
      city: detected.address,
      points,
    });
  } catch (err) {
    console.error("[delivery/points] ошибка:", err);
    return NextResponse.json(
      { ok: false, error: "Не удалось получить список пунктов выдачи." },
      { status: 502 }
    );
  }
}
