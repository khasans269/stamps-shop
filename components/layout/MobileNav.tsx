"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

// Пункты мобильного меню (те же, что в шапке на десктопе, плюс корзина).
const LINKS = [
  { href: "/catalog", label: "Каталог" },
  { href: "/individual", label: "На заказ" },
  { href: "/contacts", label: "Контакты" },
  { href: "/cart", label: "Корзина" },
];

// Мобильное меню-гамбургер. Видно только на узких экранах (md:hidden).
// По нажатию открывается выпадающий список ссылок под шапкой.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-800 hover:bg-zinc-100"
      >
        {open ? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-16 border-b border-zinc-200 bg-white shadow-sm">
          <nav className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {LINKS.map((l) => {
              const active =
                pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`border-b border-zinc-100 py-3 text-sm last:border-b-0 ${
                    active ? "font-medium text-zinc-900" : "text-zinc-600"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
