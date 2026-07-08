import Link from "next/link";
import { CartCounter } from "@/components/layout/CartCounter";
import { NavLink } from "@/components/layout/NavLink";
import { MobileNav } from "@/components/layout/MobileNav";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">

        {/* Слева: гамбургер (только на мобильном) + логотип */}
        <div className="flex items-center gap-1">
          <MobileNav />
          <Link href="/" className="font-semibold text-zinc-900 hover:opacity-80">
            <span className="hidden sm:inline">Штампы для керамики</span>
            <span className="sm:hidden">Штампы</span>
          </Link>
        </div>

        {/* Навигация по центру — скрыта на мобильном */}
        <nav className="hidden gap-6 md:flex">
          <NavLink href="/catalog">Каталог</NavLink>
          <NavLink href="/individual">На заказ</NavLink>
          <NavLink href="/contacts">Контакты</NavLink>
        </nav>

        {/* Корзина справа */}
        <CartCounter />
      </div>
    </header>
  );
}
