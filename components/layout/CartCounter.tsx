"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useCart } from "@/context/CartContext";

export function CartCounter() {
  const { totalCount } = useCart();
  // До маунта показываем "Корзина" без счётчика — иначе SSR и клиент
  // рассинхронизируются (hydration mismatch).
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Link
      href="/cart"
      className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
    >
      {mounted && totalCount > 0 ? `Корзина (${totalCount})` : "Корзина"}
    </Link>
  );
}
