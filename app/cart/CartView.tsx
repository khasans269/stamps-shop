"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import productsData from "@/data/products.json";
import type { Product } from "@/types";

const allProducts = productsData.products as Product[];

export function CartView() {
  const { items, removeItem, updateQuantity, clearCart, totalCount } = useCart();

  // Собираем строки корзины: ищем товар по productId.
  // Если товар удалён из каталога — пропускаем.
  const rows = items
    .map((item) => {
      const product = allProducts.find((p) => p.id === item.productId);
      if (!product) return null;
      return { item, product };
    })
    .filter((row): row is { item: (typeof items)[0]; product: Product } => row !== null);

  // ── Пустая корзина ────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="mb-4 text-2xl font-bold">Корзина пуста</h1>
        <p className="mb-8 text-zinc-500">
          Добавьте товары из каталога, чтобы оформить заказ.
        </p>
        <Link
          href="/catalog"
          className="inline-flex items-center rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition hover:bg-zinc-700"
        >
          Перейти в каталог
        </Link>
      </div>
    );
  }

  // ── Итоговая сумма ────────────────────────────────────────────────────────
  const totalPrice = rows.reduce(
    (sum, { item, product }) => sum + product.price * item.quantity,
    0
  );

  // ── Непустая корзина ──────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-bold md:text-4xl">Корзина</h1>

      {/* Список товаров */}
      <ul>
        {rows.map(({ item, product }) => (
          <li
            key={product.id}
            className="flex items-center gap-4 border-b border-zinc-200 py-4"
          >
            {/* Мини-картинка */}
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                  Нет фото
                </div>
              )}
            </div>

            {/* Название и цена за штуку */}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-medium">{product.name}</p>
              <p className="mt-1 text-sm text-zinc-500">
                {product.price.toLocaleString("ru-RU")} ₽ / шт
              </p>
            </div>

            {/* Кнопки количества + цена строки + удалить */}
            <div className="flex flex-shrink-0 flex-col items-end gap-2">
              {/* − количество + */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateQuantity(product.id, item.quantity - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 hover:bg-zinc-100"
                >
                  −
                </button>
                <span className="min-w-8 text-center font-medium">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQuantity(product.id, item.quantity + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 hover:bg-zinc-100"
                >
                  +
                </button>
              </div>

              {/* Линейная цена */}
              <p className="font-semibold">
                {(product.price * item.quantity).toLocaleString("ru-RU")} ₽
              </p>

              {/* Удалить */}
              <button
                type="button"
                onClick={() => removeItem(product.id)}
                className="text-xs text-zinc-400 transition-colors hover:text-red-600"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Блок итогов */}
      <div className="mt-8 border-t border-zinc-200 pt-6">
        <p className="text-sm text-zinc-500">{totalCount} товара в корзине</p>
        <p className="mt-2 text-2xl font-semibold md:text-3xl">
          Итого: {totalPrice.toLocaleString("ru-RU")} ₽
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={clearCart}
            className="rounded-2xl border border-zinc-300 bg-white px-6 py-3 text-zinc-700 transition hover:bg-zinc-50"
          >
            Очистить корзину
          </button>
          <Link
            href="/checkout"
            className="rounded-2xl bg-zinc-900 px-6 py-3 text-center font-medium text-white transition hover:bg-zinc-700"
          >
            К оформлению
          </Link>
        </div>
      </div>
    </div>
  );
}
