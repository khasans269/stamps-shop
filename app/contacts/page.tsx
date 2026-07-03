// Страница «Контакты и реквизиты». Отдельная страница нужна, чтобы
// покупатель мог быстро найти контакты и реквизиты продавца. Это
// требование ЗоЗПП (продавец обязан сообщить о себе) и ЮKassa при
// подключении (ссылку на эту страницу с ИНН указываем в анкете).
//
// Держим страницу короткой: только обязательное — кто продавец, статус,
// ИНН и способы связи. Всё остальное (доставка, возврат, оферта) уже
// описано в договоре-оферте и продублировано в подвале сайта.
//
// Серверный компонент — статический текст без интерактивности.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Контакты и реквизиты — Штампы для керамики",
  description:
    "Контактные данные и реквизиты — самозанятый мастер штампов для керамики Хасанов Аскар Ильмирович.",
};

export default function ContactsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-700">
      <h1 className="text-3xl font-bold text-zinc-900 md:text-4xl">
        Контакты и реквизиты
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

      {/* Реквизиты — обязательны: ФИО, статус самозанятого и ИНН.
          Именно на эту секцию ссылаемся в анкете ЮKassa. */}
      <h2 className="mt-10 text-xl font-semibold text-zinc-900">Реквизиты</h2>
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 leading-relaxed">
        <p>
          <b>Хасанов Аскар Ильмирович</b>
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Самозанятый, плательщик налога на профессиональный доход
        </p>
        <p className="mt-3">ИНН: 026706506184</p>
      </div>
    </div>
  );
}
