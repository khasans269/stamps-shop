import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/types";

// Карточка товара для грида каталога.
// Показывает первое фото из массива images (или placeholder, если фото нет),
// название, цену и пометку «Нет в наличии», если товар закончился.
export function ProductCard({ product }: { product: Product }) {
  // Первое фото в массиве — главное. Если массив пустой или не задан — null.
  const mainImage = product.images?.[0];

  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 transition-transform duration-300 group-hover:scale-[1.02]">
        {mainImage ? (
          <Image
            src={mainImage}
            alt={product.name}
            fill
            className="object-cover"
            // sizes — подсказка браузеру: на мобильном карточка занимает половину
            // экрана, на планшете — треть, на десктопе — четверть. По этой
            // подсказке Next.js решает, какой размер фото подтянуть.
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
            Нет фото
          </div>
        )}
      </div>
      <h3 className="mb-1 line-clamp-2 text-sm font-medium md:text-base">
        {product.name}
      </h3>
      <p className="text-lg font-semibold">
        {product.price.toLocaleString("ru-RU")} ₽
      </p>
      {!product.inStock && (
        <p className="mt-1 text-sm text-zinc-500">Нет в наличии</p>
      )}
    </Link>
  );
}
