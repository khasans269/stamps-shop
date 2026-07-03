import Link from "next/link";

// Главная страница — посадочная для холодного трафика (в т.ч. из Reels).
// Задача за 5 секунд: объяснить кто это, что продаём и куда нажать.
// Два действия: «Открыть каталог» (основное) и подписка на Telegram-канал
// (превращаем случайного гостя в подписчика, которого потом греем).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 text-center">
      <p className="mb-4 text-sm uppercase tracking-widest text-zinc-500">
        Штампы напрямую от мастера
      </p>

      <h1 className="mb-6 max-w-3xl text-4xl font-bold leading-tight text-zinc-900 md:text-6xl">
        Штампы и инструменты для&nbsp;керамики
      </h1>

      <p className="mb-10 max-w-xl text-lg text-zinc-600">
        Алфавиты, узоры и инструменты для керамистов — от любителей до студий.
        Делаю сам, помогаю с выбором и подсказываю, как пользоваться. Без
        маркетплейсов и переплат.
      </p>

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Link
          href="/catalog"
          className="inline-flex items-center rounded-full bg-zinc-900 px-8 py-4 font-medium text-white transition hover:bg-zinc-700"
        >
          Открыть каталог
        </Link>

        <a
          href="https://t.me/uniceramics"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-8 py-4 font-medium text-zinc-900 transition hover:border-zinc-500"
        >
          Telegram-канал мастера
        </a>
      </div>
    </main>
  );
}
