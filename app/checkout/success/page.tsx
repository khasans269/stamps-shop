// Серверная обёртка над клиентским SuccessClient. Цель та же, что у
// /checkout/page.tsx: метаданные через export const metadata требуют
// серверного компонента, а сама страница использует hooks и доступ к
// корзине из CartContext.

import type { Metadata } from "next";
import { Suspense } from "react";
import { SuccessClient } from "./SuccessClient";

export const metadata: Metadata = {
  title: "Заявка принята — Мастерская Аскара",
  description:
    "Спасибо за заказ! Я свяжусь с вами в течение рабочего дня для уточнения деталей.",
};

export default function CheckoutSuccessPage() {
  // useSearchParams требует обёртки в Suspense согласно правилам Next.js
  // (иначе на сборке выскочит ошибка). Suspense — это "точка ожидания",
  // во время которой Next.js может отрендерить fallback. Здесь нам он
  // не критичен, но обёртка обязательна.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <p className="text-zinc-500">Загружаю данные заказа…</p>
        </div>
      }
    >
      <SuccessClient />
    </Suspense>
  );
}
