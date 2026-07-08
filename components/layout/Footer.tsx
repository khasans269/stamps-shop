import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 py-12">
      <div className="mx-auto max-w-6xl px-4">

        {/* Две колонки на md+, стек на мобильном */}
        <div className="grid gap-8 md:grid-cols-2">

          {/* Колонка 2: информация */}
          <div>
            <p className="mb-3 font-semibold text-zinc-900">Информация</p>
            <ul className="flex flex-col gap-2">
              <li>
                <Link
                  href="/contacts"
                  className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  Контакты
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/oferta"
                  className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  Договор-оферта
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/privacy"
                  className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  Политика конфиденциальности
                </Link>
              </li>
            </ul>
          </div>

          {/* Колонка 3: контакты */}
          <div>
            <p className="mb-3 font-semibold text-zinc-900">Контакты</p>
            <ul className="flex flex-col gap-2">
              <li>
                <a
                  href="mailto:khasans269@gmail.com"
                  className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  khasans269@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/pri3dnt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  Написать в Telegram — @pri3dnt
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/uniceramics"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  Telegram-канал — @uniceramics
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Юридическая подпись внизу — заменили общий копирайт.
            По ЗоЗПП покупатель должен видеть, кто продавец, на каждой
            странице сайта. Самый аккуратный способ — мелкая строка в подвале. */}
        <div className="mt-8 border-t border-zinc-200 pt-6 text-center text-sm text-zinc-500">
          <p>Самозанятый Хасанов Аскар Ильмирович</p>
          <p className="mt-1">ИНН: 026706506184</p>
        </div>
      </div>
    </footer>
  );
}
