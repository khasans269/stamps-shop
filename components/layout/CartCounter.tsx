"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useCart } from "@/context/CartContext";

export function CartCounter() {
  const { totalCount } = useCart();
  // Подсветка активной страницы «Корзина» — как у остальных пунктов меню.
  const pathname = usePathname();
  const isActive = pathname === "/cart" || pathname.startsWith("/cart/");
  // До маунта показываем "Корзина" без счётчика — иначе SSR и клиент
  // рассинхронизируются (hydration mismatch).
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Одноразовая установка флага маунта для защиты от hydration mismatch —
    // тот же приём, что в других клиентских компонентах проекта.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <Link
      href="/cart"
      aria-current={isActive ? "page" : undefined}
      className={`text-sm transition-colors ${
        isActive
          ? "text-zinc-900 underline underline-offset-8 decoration-1"
          : "text-zinc-600 hover:text-zinc-900"
      }`}
    >
      {mounted && totalCount > 0 ? `Корзина (${totalCount})` : "Корзина"}
    </Link>
  );
}
