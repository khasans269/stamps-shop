import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200">
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover"
                // На мобильном фото занимает всю ширину, на десктопе — половину.
                sizes="(max-width: 768px) 100vw, 50vw"
                // priority: это главное фото на странице, грузим в первую очередь.
                priority
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

          {/* Характеристики. Показываем только те поля, которые заданы в products.json. */}
          {(product.itemsInSet || product.letterHeight) && (
            <dl className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {product.itemsInSet && (
                <div className="flex gap-2">
                  <dt className="text-zinc-500">В наборе:</dt>
                  <dd className="font-medium text-zinc-900">
                    {product.itemsInSet} шт
                  </dd>
                </div>
              )}
              {product.letterHeight && (
                <div className="flex gap-2">
                  <dt className="text-zinc-500">Высота букв:</dt>
                  <dd className="font-medium text-zinc-900">
                    {product.letterHeight}
                  </dd>
                </div>
              )}
            </dl>
          )}

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
