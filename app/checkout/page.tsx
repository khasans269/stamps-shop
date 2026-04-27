// Серверная обёртка над клиентской формой чекаута. Сделана отдельно от
// CheckoutClient.tsx, потому что:
//   - export const metadata работает только в серверных компонентах;
//   - саму форму нельзя сделать серверной — она использует hooks (useState,
//     useRouter) и доступ к корзине через клиентский контекст.
// Поэтому этот файл — тонкий обёртывающий компонент.

import type { Metadata } from "next";
import { CheckoutClient } from "./CheckoutClient";

export const metadata: Metadata = {
  title: "Оформление заказа — Мастерская Аскара",
  description:
    "Оформление заказа на штампы для керамики, текстурные ролики и инструменты.",
};

export default function CheckoutPage() {
  return <CheckoutClient />;
}
