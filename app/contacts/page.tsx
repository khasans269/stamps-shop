// Страница «Контакты» — способы связи с мастером.
// Реквизиты продавца (ФИО, статус самозанятого, ИНН) не дублируем здесь:
// они показаны в подвале сайта на КАЖДОЙ странице, что закрывает и
// требование ЗоЗПП, и анкету ЮKassa (там достаточно ссылки на сайт).
//
// Серверный компонент — статический текст без интерактивности.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Контакты — Штампы для керамики",
  description:
    "Как связаться с мастером штампов для керамики. Реквизиты продавца — в подвале сайта.",
};

export default function ContactsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-700">
      <h1 className="text-3xl font-bold text-zinc-900 md:text-4xl">
        Контакты
      </h1>
      <p className="mt-3 text-zinc-500">
        Вопросы о товарах, заказах или индивидуальном изготовлении — напишите.
        Отвечаю в течение рабочего дня.
      </p>

      {/* Способы связи — обязательны: покупатель должен иметь способ
          связаться с продавцом. */}
      <h2 className="mt-10 text-xl font-semibold text-zinc-900">
        Связаться с мастером
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        <li>
          <span className="text-sm text-zinc-500">Telegram:</span>{" "}
          <a
            href="https://t.me/pri3dnt"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-900 underline hover:text-zinc-700"
          >
            @pri3dnt
          </a>
        </li>
        <li>
          <span className="text-sm text-zinc-500">Email:</span>{" "}
          <a
            href="mailto:khasans269@gmail.com"
            className="font-medium text-zinc-900 underline hover:text-zinc-700"
          >
            khasans269@gmail.com
          </a>
        </li>
      </ul>
    </div>
  );
}
