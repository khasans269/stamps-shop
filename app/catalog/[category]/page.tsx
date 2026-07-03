import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { TagFilter } from "@/components/TagFilter";
import productsData from "@/data/products.json";
import {
  CATEGORY_NAMES,
  CATEGORY_ORDER,
  TAG_NAMES,
  TAG_ORDER,
  type Category,
  type Product,
  type Tag,
} from "@/types";

// ── Утилиты ────────────────────────────────────────────────────────────────

// Превращаем строку из URL в типизированную Category или null.
// Нужно, потому что в URL может прийти что угодно — `/catalog/blabla`,
// `/catalog/Alphabets-cyrillic`, `/catalog/`. Доверять нельзя.
function parseCategory(input: string): Category | null {
  return (CATEGORY_ORDER as readonly string[]).includes(input)
    ? (input as Category)
    : null;
}

// То же самое для тега — но в отличие от категории, невалидный тег
// мы не считаем ошибкой 404. Просто игнорируем (как будто фильтр снят).
// Так удобнее, если у кого-то старая ссылка с убранным тегом.
function parseTag(input: string | undefined): Tag | null {
  if (!input) return null;
  return (TAG_ORDER as readonly string[]).includes(input)
    ? (input as Tag)
    : null;
}

const allProducts = productsData.products as Product[];

// ── generateStaticParams ───────────────────────────────────────────────────
// На этапе сборки Next.js заранее отрендерит страницы для каждой категории —
// они быстрее открываются и лучше индексируются поисковиками.
// Варианты с ?tag=... попадают под динамический рендер — это нормально,
// статически их пересчитывать каждый раз не нужно.

export function generateStaticParams() {
  return CATEGORY_ORDER.map((category) => ({ category }));
}

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ tag?: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const { tag } = await searchParams;
  const parsed = parseCategory(category);
  const parsedTag = parseTag(tag);
  if (!parsed) {
    return { title: "Категория не найдена" };
  }
  const name = CATEGORY_NAMES[parsed];
  // Если выбран тег — отражаем его в title, это полезно и пользователю,
  // и поисковику. «Алфавиты — кириллица: с цифрами/знаками — ...».
  const titleBase = parsedTag
    ? `${name}: ${TAG_NAMES[parsedTag]}`
    : name;
  return {
    title: `${titleBase} — Штампы для керамики`,
    description: `Каталог: ${name.toLowerCase()} — штампы и инструменты для керамистов.`,
  };
}

// ── Сама страница ──────────────────────────────────────────────────────────

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ tag?: string }>;
}) {
  const { category } = await params;
  const { tag } = await searchParams;
  const parsed = parseCategory(category);
  const parsedTag = parseTag(tag);

  // Невалидная категория → стандартная 404. Это полезно и пользователю
  // (понятнее, чем пустой грид), и SEO (Google не будет индексировать
  // мусорные URL вроде /catalog/qwerty).
  if (!parsed) {
    notFound();
  }

  // Сначала отбираем по категории, потом по тегу (если задан).
  let products = allProducts.filter((p) => p.category === parsed);
  if (parsedTag) {
    products = products.filter((p) => p.tags?.includes(parsedTag));
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 md:py-16">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold md:text-4xl">{CATEGORY_NAMES[parsed]}</h1>
        <Link href="/catalog" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Весь каталог
        </Link>
      </div>

      <CategoryFilter active={parsed} />
      <TagFilter category={parsed} active={parsedTag} />

      {products.length === 0 ? (
        // Дружелюбная заглушка для пустой выборки. Случай: фильтр по тегу
        // сузил выборку до нуля — например, "категория А + тег В = пусто".
        // Тогда полезно подсказать, как вернуться к более широкому набору.
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-zinc-600">
            {parsedTag
              ? "В этой категории пока нет товаров с таким фильтром."
              : "В этой категории пока нет товаров."}
          </p>
          <Link
            href={parsedTag ? `/catalog/${parsed}` : "/catalog"}
            className="mt-4 inline-block text-sm font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
          >
            {parsedTag ? "Снять фильтр" : "Посмотреть весь каталог"}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  );
}
