import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50 py-12">
      <div className="mx-auto max-w-6xl px-4">

        {/* Три колонки на md+, стек на мобильном */}
        <div className="grid gap-8 md:grid-cols-3">

          {/* Колонка 1: о магазине */}
          <div>
            <p className="mb-3 font-semibold text-zinc-900">
              Штампы для керамики
            </p>
            <p className="text-sm leading-relaxed text-zinc-500">
              Алфавиты, штампы с узорами, текстурные ролики и инструменты для
              керамистов. Прямые продажи от мастера.
            </p>
          </div>

          {/* Колонка 2: информация */}
          <div>
            <p className="mb-3 font-semibold text-zinc-900">Информация</p>
            <ul className="flex flex-col gap-2">
              <li>
                <Link
                  href="/faq"
                  className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  Вопросы и ответы
                </Link>
              </li>
              <li>
                <Link
                  href="/contacts"
                  className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  Контакты и реквизиты
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
                  href="https://instagram.com/stamps_askar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  @stamps_askar
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Копирайт */}
        <p className="mt-8 border-t border-zinc-200 pt-6 text-center text-sm text-zinc-500">
          © 2026 Мастерская Аскара
        </p>
      </div>
    </footer>
  );
}
