// Страница «Индивидуальный заказ» — что можно заказать по своему эскизу,
// с примерами работ. Серверный компонент (сами картинки-увеличения — в
// клиентском ZoomableImage).
//
// ВАЖНО про фото: клади сюда только те снимки, на публикацию которых
// заказчик дал согласие. Если на изделии чужой логотип/эскиз — это объект
// авторского права (иногда и товарный знак) заказчика. Безопасно: свои
// макеты, монограммы, узоры или согласованные работы.
//
// ВНИМАНИЕ к именам файлов: сервер (Vercel/Timeweb — Linux) различает
// регистр. Если файл называется photo.JPG, то и путь должен быть .JPG,
// иначе будет 404. Проще держать имена в нижнем регистре: photo.jpg.

import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { ZoomableImage } from "@/components/individual/ZoomableImage";

export const metadata: Metadata = {
  title: "Индивидуальный заказ для керамики — Штампы для керамики",
  description:
    "Индивидуальный заказ: авторский штамп с логотипом, каттеры, товары в нестандартном размере, мастер-модели для литья, 3D-печать. Эскиз не обязателен.",
};

// Что можно заказать. У каждого пункта — фото сверху.
// Чтобы подключить фото: положи файл в public/images/individual/ и впиши
// путь в поле image (например image: "/images/individual/shtampy.jpg").
// Пока image не задан — показывается серая заглушка «фото».
const WHAT_TO_ORDER: { title: string; text: string; image?: string }[] = [
  {
    title: "Авторские штампы",
    text: "С вашим логотипом, надписью или собственным узором.",
    image: "/images/individual/st01.jpg",
  },
  {
    title: "Каттеры (вырубки)",
    text: "Вырубка нужной формы — для создания деталей из пласта.",
    image: "/images/individual/cut1.jpg",
  },
  {
    title: "Штампы для тарелок",
    text: "Большого размера, с жёстким основанием.",
    image: "/images/individual/plates.jpg",
  },
  {
    title: "Товары из каталога в нестандартном размере",
    text: "Любая позиция из каталога — под ваш размер.",
    image: "/images/individual/custom-size.jpg",
  },
  {
    title: "Другие товары для керамики",
    text: "Органайзеры под ваш инструмент, пуансоны, мастер-модели для литья и т.д.",
    image: "/images/individual/other.jpg",
  },
  {
    title: "3D-печать на заказ",
    text: "Техничесекие и художественные детали",
    image: "/images/individual/print0.jpg",
  },
];

// Примеры работ берём АВТОМАТИЧЕСКИ из папки:
//   public/images/individual/stamp_example/
// Просто закинь туда согласованные фото — они сами появятся в блоке
// «Примеры» (по алфавиту имён). Ничего в коде править не нужно.
// Файлы читаются при сборке; если добавил фото — перезапусти dev / передеплой.
const EXAMPLES_DIR = "public/images/individual/stamp_example";

function getExampleImages(): string[] {
  try {
    const dir = path.join(process.cwd(), EXAMPLES_DIR);
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .sort()
      .map((f) => `/images/individual/stamp_example/${f}`);
  } catch {
    // Папки ещё нет или пустая — покажем заглушки.
    return [];
  }
}

export default function IndividualPage() {
  // Читаем папку с примерами при каждой отрисовке (а не один раз при
  // импорте) — так свежие фото подхватываются надёжнее.
  const EXAMPLES = getExampleImages();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 text-zinc-700 md:py-16">
      {/* ── Заголовок и вводный текст ─────────────────────────────────── */}
      <h1 className="text-3xl font-bold text-zinc-900 md:text-4xl">
        Индивидуальный заказ
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-zinc-600">
        Помимо товаров из наличия, вы можете обратиться ко мне с индивидуальным
        заказом — наличие эскиза для этого не обязательно, но приветствуется.
        Это может быть авторский штамп с вашим логотипом, каттер с определённой
        фигурой, мастер-модель для литейной формы или даже разработка формы под
        ключ.
      </p>

      <div className="mt-6">
        <a
          href="https://t.me/pri3dnt"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-2xl bg-zinc-900 px-6 py-4 text-base font-medium text-white transition hover:bg-zinc-700"
        >
          Обсудить заказ в Telegram
        </a>
      </div>

      {/* ── Что можно заказать (карточки с крупным фото) ───────────────── */}
      <section className="mt-14">
        <h2 className="text-2xl font-semibold text-zinc-900">
          Что можно заказать
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {WHAT_TO_ORDER.map((item, index) => (
            <div
              key={item.title}
              className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
            >
              {/* Крупное фото сверху. Есть item.image — показываем с
                  увеличением по клику; нет — серая заглушка. */}
              <div className="relative aspect-[4/3] w-full border-b border-zinc-200 bg-white">
                {item.image ? (
                  <ZoomableImage
                    src={item.image}
                    alt={item.title}
                    sizes="(min-width: 640px) 50vw, 100vw"
                    priority={index === 0}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                    фото
                  </div>
                )}
              </div>
              <div className="p-5">
                <h3 className="font-medium text-zinc-900">{item.title}</h3>
                <p className="mt-1 text-sm text-zinc-600">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Примеры индивидуальных штампов ──────────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-2xl font-semibold text-zinc-900">Примеры индивидуальных штампов</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Несколько заказов, которые я уже сделал. Нажмите на фото, чтобы
          рассмотреть поближе.
        </p>
        {EXAMPLES.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {EXAMPLES.map((src, i) => (
              <div
                key={src}
                className="relative aspect-square overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
              >
                <ZoomableImage
                  src={src}
                  alt={`Пример работы ${i + 1}`}
                  sizes="(min-width: 640px) 33vw, 50vw"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-400"
              >
                Пример {n}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Финальный призыв (компактная плашка) ───────────────────────── */}
      <section className="mt-12 rounded-2xl bg-zinc-900 px-6 py-5 text-center text-white sm:flex sm:items-center sm:justify-between sm:text-left">
        <div>
          <h2 className="text-lg font-semibold">Есть идея для заказа?</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Напишите — обсудим детали и подготовлю макет.
          </p>
        </div>
        <div className="mt-4 flex flex-col items-center gap-3 sm:mt-0 sm:flex-row">
          <a
            href="https://t.me/pri3dnt"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
          >
            Написать в Telegram
          </a>
          <Link
            href="/contacts"
            className="inline-block rounded-xl border border-zinc-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Контакты
          </Link>
        </div>
      </section>
    </div>
  );
}
