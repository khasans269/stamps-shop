// Страница «Контакты и реквизиты». Отдельная страница нужна, чтобы
// покупатель мог быстро найти контакты и реквизиты, не открывая 11
// разделов оферты. Это также требование к интернет-магазину по ЗоЗПП:
// продавец обязан предоставить покупателю информацию о себе.
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
        Если у вас есть вопросы о товарах, заказах или индивидуальном
        изготовлении — напишите. Отвечаю в течение рабочего дня.
      </p>

      {/* Способы связи */}
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

      {/* Telegram-канал — отдельной секцией: это не способ связи,
          а площадка для подписки на новости магазина. */}
      <h2 className="mt-10 text-xl font-semibold text-zinc-900">
        Telegram-канал
      </h2>
      <p className="mt-3">
        Новые работы, процесс изготовления и анонсы — в моём канале:{" "}
        <a
          href="https://t.me/uniceramics"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-zinc-900 underline hover:text-zinc-700"
        >
          @uniceramics
        </a>
      </p>

      {/* Реквизиты — в карточке, чтобы было удобно копировать */}
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

      {/* Адрес для возвратов */}
      <h2 className="mt-10 text-xl font-semibold text-zinc-900">
        Адрес для возврата товара
      </h2>
      <p className="mt-4 leading-relaxed">
        196240, Санкт-Петербург, Коломяжский проспект, д. 15, корп. 8, пункт
        выдачи СДЭК. Получатель — Хасанов Аскар Ильмирович, отправление до
        востребования.
      </p>
      <p className="mt-3 text-sm text-zinc-500">
        Перед отправкой товара на возврат, пожалуйста, свяжитесь со мной —
        чтобы согласовать причину возврата и убедиться, что товар получит
        корректную обработку.
      </p>

      {/* Юридические документы */}
      <h2 className="mt-10 text-xl font-semibold text-zinc-900">
        Юридические документы
      </h2>
      <ul className="mt-4 flex flex-col gap-2">
        <li>
          <a
            href="/legal/oferta"
            className="text-zinc-900 underline hover:text-zinc-700"
          >
            Договор публичной оферты
          </a>
        </li>
        <li>
          <a
            href="/legal/privacy"
            className="text-zinc-900 underline hover:text-zinc-700"
          >
            Политика конфиденциальности
          </a>
        </li>
      </ul>
    </div>
  );
}
