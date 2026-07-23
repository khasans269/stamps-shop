// ВРЕМЕННЫЙ роут: показывает ИСХОДЯЩИЙ (outbound) IP сервера — тот, с которого
// приложение обращается к внешним API (нужно для анкеты Ozon Seller API).
// Спрашиваем у нескольких echo-сервисов на случай, если один недоступен.
// Удалить после того, как узнаем IP.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const out: Record<string, string> = {};
  try {
    const r = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
    });
    out.ipify = (await r.json()).ip ?? "нет поля ip";
  } catch (e) {
    out.ipify = "err: " + String(e);
  }
  try {
    const r = await fetch("https://ifconfig.me/ip", { cache: "no-store" });
    out.ifconfig = (await r.text()).trim();
  } catch (e) {
    out.ifconfig = "err: " + String(e);
  }
  return NextResponse.json(out);
}
