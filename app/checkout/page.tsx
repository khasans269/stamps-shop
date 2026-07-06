// Серверная обёртка над клиентской формой чекаута. Сделана отдельно от
// CheckoutClient.tsx, потому что:
//   - export const metadata работает только в серверных компонентах;
//   - саму форму нельзя сделать серверной — она использует hooks (useState,
//     useRouter) и доступ к корзине через клиентский контекст.
// Поэтому этот файл — тонкий обёртывающий компонент.

import type { Metadata } from "next";
import { CheckoutClient } from "./CheckoutClient";
import { getDeliveryFlatFee } from "@/lib/order";

export const metadata: Metadata = {
  title: "Оформление заказа — Керамическая мастерская Аскара",
  description:
    "Оформление заказа на штампы для керамики, текстурные ролики и инструменты.",
};

export default function CheckoutPage() {
  // Фикс-стоимость доставки читаем на сервере (из env DELIVERY_FLAT_FEE) —
  // единый источник правды. Прокидываем в клиентскую форму, чтобы показать
  // покупателю и посчитать итог. Роут /api/payment/create всё равно
  // пересчитает сумму сам из той же переменной — клиенту не доверяем.
  const deliveryFee = getDeliveryFlatFee();
  // Ключ Яндекс.Карт для виджета ПВЗ СДЭК (виджет рисует карту на Яндекс.
  // Картах). Ключ ограничен HTTP Referrer, поэтому его норм передавать в
  // браузер. Если не задан — виджет не покажется, доставка «сообщу отдельно».
  const mapsApiKey = process.env.YANDEX_MAPS_API_KEY ?? "";
  return <CheckoutClient deliveryFee={deliveryFee} mapsApiKey={mapsApiKey} />;
}
