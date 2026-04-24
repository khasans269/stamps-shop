import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">

        {/* Логотип / название магазина */}
        <Link href="/" className="font-semibold text-zinc-900 hover:opacity-80">
          <span className="hidden sm:inline">Штампы для керамики</span>
          <span className="sm:hidden">Штампы</span>
        </Link>

        {/* Навигация по центру — скрыта на мобильном */}
        <nav className="hidden gap-6 md:flex">
          <Link
            href="/catalog"
            className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
          >
            Каталог
          </Link>
          <Link
            href="/faq"
            className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
          >
            FAQ
          </Link>
        </nav>

        {/* Корзина справа */}
        <Link
          href="/cart"
          className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
        >
          Корзина (0)
        </Link>
      </div>
    </header>
  );
}
