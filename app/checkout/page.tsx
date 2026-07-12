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
  // id склада отгрузки для виджета ПВЗ Яндекс Доставки (source_platform_station).
  // Токен виджету не нужен. Если не задан — способ «Яндекс ПВЗ» покажет
  // «стоимость сообщу отдельно».
  const yandexStationId = process.env.YANDEX_DELIVERY_SOURCE_STATION_ID ?? "";
  return (
    <CheckoutClient
      deliveryFee={deliveryFee}
      yandexStationId={yandexStationId}
    />
  );
}
