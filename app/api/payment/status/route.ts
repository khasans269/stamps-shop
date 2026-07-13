// Проверка актуального статуса платежа у ЮKassa по paymentId.
// GET /api/payment/status?paymentId=<id> → { status, paid }
// Нужно странице успеха, чтобы не показывать «оплачено» тем, кто не заплатил.

import { NextResponse } from "next/server";
import { getPayment } from "@/lib/yookassa";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const paymentId = new URL(request.url).searchParams.get("paymentId");
  if (!paymentId) {
    return NextResponse.json(
      { status: null, error: "paymentId обязателен" },
      { status: 400 }
    );
  }
  try {
    const payment = await getPayment(paymentId);
    return NextResponse.json({
      status: payment.status,
      paid: payment.status === "succeeded",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[payment/status] ошибка:", detail);
    return NextResponse.json(
      { status: null, error: "payment status error", detail },
      { status: 502 }
    );
  }
}
