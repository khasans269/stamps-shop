"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/context/CartContext";
import productsData from "@/data/products.json";
import type { Product } from "@/types";
import { PendingRow } from "@/components/cart/PendingRow";

const allProducts = productsData.products as Product[];

export function CartView() {
  const {
    cartLines,
    removeItem,
    updateQuantity,
    clearCart,
    totalCount,
    pendingExpiresAt,
    cancelPendingItem,
  } = useCart();

  // Собираем строки корзины: ищем товар по productId.
  // Если товар удалён из каталога — пропускаем.
  // cartLines включает и обычные, и pending-строки в одном порядке.
  const rows = cartLines
    .map((line) => {
      const product = allProducts.find((p) => p.id === line.productId);
      if (!product) return null;
      return { line, product };
    })
    .filter(
      (row): row is { line: (typeof cartLines)[0]; product: Product } =>
        row !== null
    );

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
  // Считаем только по НЕ pending-строкам — pending уже не должны влиять
  // на итоговую сумму, иначе после удаления пользователь видит старую
  // цифру и думает, что удаление не сработало.
  const totalPrice = rows.reduce((sum, { line, product }) => {
    if (line.isPending) return sum;
    return sum + product.price * line.quantity;
  }, 0);

  // Активны ли pending-удаления и есть ли видимые товары — нужно для
  // кнопки "Очистить корзину" и пр. (нет смысла её жать второй раз).
  const hasVisible = rows.some((r) => !r.line.isPending);

  // Минимальная сумма заказа в рублях. Должна совпадать с такой же
  // константой в /checkout/CheckoutClient.tsx — там валидация при
  // отправке формы. Здесь проверка нужна, чтобы не пускать на чекаут
  // до набора нужной суммы.
  const MIN_ORDER_TOTAL = 500;
  const meetsMinimum = totalPrice >= MIN_ORDER_TOTAL;
  const canCheckout = hasVisible && meetsMinimum;

  // ── Непустая корзина ──────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-bold md:text-4xl">Корзина</h1>

      {/* Список товаров. Pending-строки показываются плашкой PendingRow на
          том же месте, где был товар — без перестроения списка. */}
      <ul>
        {rows.map(({ line, product }) => {
          if (line.isPending && pendingExpiresAt !== null) {
            return (
              <PendingRow
                key={product.id}
                product={product}
                expiresAt={pendingExpiresAt}
                onRestore={() => cancelPendingItem(product.id)}
              />
            );
          }

          return (
            <li
              key={product.id}
              className="flex items-center gap-4 border-b border-zinc-200 py-4"
            >
              {/* Картинка + название + цена — кликабельная ссылка на товар */}
              <Link
                href={`/product/${product.slug}`}
                className="-m-2 flex flex-1 min-w-0 items-center gap-4 rounded-xl p-2 transition-colors hover:bg-zinc-50"
              >
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200">
                  {product.images?.[0] ? (
                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                      Нет фото
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 font-medium">{product.name}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {product.price.toLocaleString("ru-RU")} ₽ / шт
                  </p>
                </div>
              </Link>

              {/* Кнопки количества + цена строки + удалить */}
              <div className="flex flex-shrink-0 flex-col items-end gap-2">
                {/* − количество + */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateQuantity(product.id, line.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 hover:bg-zinc-100"
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center font-medium">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(product.id, line.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 hover:bg-zinc-100"
                  >
                    +
                  </button>
                </div>

                {/* Линейная цена */}
                <p className="font-semibold">
                  {(product.price * line.quantity).toLocaleString("ru-RU")} ₽
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
          );
        })}
      </ul>

      {/* Блок итогов */}
      <div className="mt-8 border-t border-zinc-200 pt-6">
        <p className="text-sm text-zinc-500">{totalCount} товара в корзине</p>
        <p className="mt-2 text-2xl font-semibold md:text-3xl">
          Итого: {totalPrice.toLocaleString("ru-RU")} ₽
        </p>

        {/* Подсказка про минимум — показываем только если в корзине есть
            видимые товары, но сумма не дотягивает до минимума. На пустой
            корзине этот блок не нужен (там будет другой UI). */}
        {hasVisible && !meetsMinimum && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Минимальная сумма заказа — {MIN_ORDER_TOTAL} ₽. Добавьте ещё
            товаров на {(MIN_ORDER_TOTAL - totalPrice).toLocaleString("ru-RU")} ₽,
            чтобы оформить заказ.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={clearCart}
            disabled={!hasVisible}
            className="rounded-2xl border border-zinc-300 bg-white px-6 py-3 text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Очистить корзину
          </button>
          <Link
            href="/checkout"
            aria-disabled={!canCheckout}
            className={`rounded-2xl bg-zinc-900 px-6 py-3 text-center font-medium text-white transition hover:bg-zinc-700 ${
              !canCheckout ? "pointer-events-none opacity-50" : ""
            }`}
          >
            К оформлению
          </Link>
        </div>
      </div>
    </div>
  );
}
