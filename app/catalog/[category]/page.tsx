import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import productsData from "@/data/products.json";
import {
  CATEGORY_NAMES,
  CATEGORY_ORDER,
  type Category,
  type Product,
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

const allProducts = productsData.products as Product[];

// ── generateStaticParams ───────────────────────────────────────────────────
// На этапе сборки Next.js заранее отрендерит страницы для каждой категории —
// они быстрее открываются и лучше индексируются поисковиками.

export function generateStaticParams() {
  return CATEGORY_ORDER.map((category) => ({ category }));
}

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const parsed = parseCategory(category);
  if (!parsed) {
    return { title: "Категория не найдена" };
  }
  const name = CATEGORY_NAMES[parsed];
  return {
    title: `${name} — Штампы для керамики`,
    description: `Каталог: ${name.toLowerCase()} — штампы и инструменты для керамистов.`,
  };
}

// ── Сама страница ──────────────────────────────────────────────────────────

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const parsed = parseCategory(category);

  // Невалидная категория → стандартная 404. Это полезно и пользователю
  // (понятнее, чем пустой грид), и SEO (Google не будет индексировать
  // мусорные URL вроде /catalog/qwerty).
  if (!parsed) {
    notFound();
  }

  const products = allProducts.filter((p) => p.category === parsed);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 md:py-16">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold md:text-4xl">{CATEGORY_NAMES[parsed]}</h1>
        <Link href="/catalog" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Весь каталог
        </Link>
      </div>

      <CategoryFilter active={parsed} />

      {products.length === 0 ? (
        // Дружелюбная заглушка для пустой категории. На случай, если все
        // товары распродались и пока ничего нового не добавили.
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-12 text-center">
          <p className="text-zinc-600">В этой категории пока нет товаров.</p>
          <Link
            href="/catalog"
            className="mt-4 inline-block text-sm font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-700"
          >
            Посмотреть весь каталог
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
