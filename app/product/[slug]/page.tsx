import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import productsData from "@/data/products.json";
import type { Product } from "@/types";
import { AddToCartButton } from "@/components/product/AddToCartButton";

// ─── Утилита ────────────────────────────────────────────────────────────────

function findProduct(slug: string): Product | undefined {
  return (productsData.products as Product[]).find((p) => p.slug === slug);
}

// ─── generateStaticParams ───────────────────────────────────────────────────
// Говорит Next.js: «собери эти URL на этапе build».
// Без этого в production страницы рендерились бы динамически при каждом запросе.

export function generateStaticParams() {
  return productsData.products.map((p) => ({ slug: p.slug }));
}

// ─── Metadata ───────────────────────────────────────────────────────────────
// Next.js вызывает эту функцию, чтобы подставить <title> в <head>.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = findProduct(slug);
  return {
    title: product ? product.name : "Товар не найден",
  };
}

// ─── Страница ────────────────────────────────────────────────────────────────

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = findProduct(slug);

  // Если slug не совпал ни с одним товаром — отдаём стандартную 404-страницу.
  if (!product) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      {/* Основная секция: на мобильном — столбец, на md+ — две колонки */}
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">

        {/* ЛЕВАЯ КОЛОНКА: фото или placeholder */}
        <div className="w-full md:w-1/2">
          <div className="aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400">
                Нет фото
              </div>
            )}
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: информация о товаре */}
        <div className="flex w-full flex-col md:w-1/2">
          {/* Название */}
          <h1 className="mb-4 text-2xl font-bold leading-snug md:text-3xl">
            {product.name}
          </h1>

          {/* Цена */}
          <p className="mb-6 text-3xl font-semibold md:text-4xl">
            {product.price.toLocaleString("ru-RU")} ₽
          </p>

          {/* Описание */}
          <p className="mb-8 leading-relaxed text-zinc-600">
            {product.description}
          </p>

          <AddToCartButton productId={product.id} inStock={product.inStock} />
        </div>
      </div>

      {/* Ссылка назад в каталог */}
      <div className="mt-12">
        <Link
          href="/catalog"
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
        >
          ← Назад к каталогу
        </Link>
      </div>
    </main>
  );
}
