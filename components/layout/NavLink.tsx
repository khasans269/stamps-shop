"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ссылка в шапке с подсветкой активной страницы: у текущего раздела —
// подчёркивание и тёмный цвет, у остальных — обычный серый.
// Активным считается точное совпадение пути или вложенный путь
// (например /catalog/tools тоже подсветит «Каталог»).
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`text-sm transition-colors ${
        isActive
          ? "text-zinc-900 underline underline-offset-8 decoration-1"
          : "text-zinc-600 hover:text-zinc-900"
      }`}
    >
      {children}
    </Link>
  );
}
