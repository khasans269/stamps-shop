"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";

interface Props {
  productId: string;
  inStock: boolean;
}

export function AddToCartButton({ productId, inStock }: Props) {
  const { items, addItem, updateQuantity } = useCart();
  const [added, setAdded] = useState(false);

  const itemInCart = items.find((i) => i.productId === productId);
  const qty = itemInCart?.quantity ?? 0;

  // Товар не в наличии
  if (!inStock) {
    return (
      <div>
        <p className="mb-3 font-medium text-zinc-500">Нет в наличии</p>
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-2xl bg-zinc-200 px-6 py-4 text-base font-medium text-zinc-400 md:w-auto md:self-start"
        >
          В корзину
        </button>
      </div>
    );
  }

  // Товар уже в корзине — показываем управление количеством
  if (qty > 0) {
    return (
      <div>
        <div className="flex w-full items-center gap-3 rounded-2xl border border-zinc-300 bg-white p-2 md:w-auto md:self-start">
          <span className="ml-2 text-sm text-zinc-600">В корзине:</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateQuantity(productId, qty - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 hover:bg-zinc-100"
            >
              −
            </button>
            <span className="min-w-8 text-center font-medium">{qty}</span>
            <button
              type="button"
              onClick={() => updateQuantity(productId, qty + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 hover:bg-zinc-100"
            >
              +
            </button>
          </div>
        </div>
        <Link
          href="/cart"
          className="mt-2 inline-block text-sm text-zinc-500 hover:text-zinc-900"
        >
          Перейти в корзину →
        </Link>
      </div>
    );
  }

  // Товар ещё не в корзине
  function handleClick() {
    addItem(productId);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-2xl bg-zinc-900 px-6 py-4 text-base font-medium text-white transition-opacity hover:opacity-80 md:w-auto md:self-start"
    >
      {added ? "Добавлено ✓" : "В корзину"}
    </button>
  );
}
