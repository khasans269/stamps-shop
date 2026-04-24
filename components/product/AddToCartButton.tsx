"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";

interface Props {
  productId: string;
  inStock: boolean;
}

export function AddToCartButton({ productId, inStock }: Props) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  function handleClick() {
    addItem(productId);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

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
