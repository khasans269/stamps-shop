import Link from "next/link";
import type { Product } from "@/types";

// Карточка товара для грида каталога.
// Показывает фото (или placeholder, если картинки нет), название, цену
// и пометку «Нет в наличии», если товар закончился.
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="mb-3 aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 transition-transform duration-300 group-hover:scale-[1.02]">
        {product.image ? (
          // Пока используем обычный <img>; позже перейдём на next/image
          // когда у товаров будут известны реальные размеры фото.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover"
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
