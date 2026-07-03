import Link from "next/link";
import {
  visibleCategories,
  visibleCountByCategory,
  visibleProducts,
} from "@/lib/products";
import { CATEGORY_NAMES_SHORT, type Category } from "@/types";

// Серверный компонент: рендерится на сервере, никаких "use client" не надо.
// Принимает active — текущую активную категорию или null для вкладки «Все».
//
// Что делает:
//   1) Считает товары по каждой категории один раз (не на каждом ререндере).
//   2) Рисует ряд чипсов: «Все (9)» + по чипсу на каждую категорию из CATEGORY_ORDER.
//   3) Подсвечивает активный чип тёмным фоном.
//   4) Каждый чип — Link на /catalog или /catalog/<id>, чтобы переходы были
//      классическими навигациями со сменой URL (а не клиентским фильтром).

interface Props {
  active: Category | null;
}

// Счётчики и список категорий берём из lib/products — там уже учтены
// скрытые товары (hidden) и отброшены пустые категории.
const totalCount = visibleProducts.length;

export function CategoryFilter({ active }: Props) {
  return (
    <nav
      // role+aria-label делают этот блок понятным скринридерам как «фильтр».
      aria-label="Фильтр по категориям"
      className="mb-8 flex flex-wrap gap-2"
    >
      <Chip href="/catalog" label="Все" count={totalCount} isActive={active === null} />
      {visibleCategories.map((category) => (
        <Chip
          key={category}
          href={`/catalog/${category}`}
          label={CATEGORY_NAMES_SHORT[category]}
          count={visibleCountByCategory[category]}
          isActive={active === category}
        />
      ))}
    </nav>
  );
}

// ── Один чип ───────────────────────────────────────────────────────────────
// Вынесен отдельно, чтобы не плодить условия в JSX. Активный — тёмный,
// неактивный — белый с рамкой; пустые категории дополнительно приглушаются.

function Chip({
  href,
  label,
  count,
  isActive,
}: {
  href: string;
  label: string;
  count: number;
  isActive: boolean;
}) {
  const isEmpty = count === 0;

  // Базовые стили общие; цветовые — отдельно по состояниям.
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors";

  let color: string;
  if (isActive) {
    color = "bg-zinc-900 text-white";
  } else if (isEmpty) {
    // Пустая категория: показываем, но видно, что зайти туда мало смысла.
    color = "border border-zinc-200 bg-white text-zinc-400 hover:border-zinc-300";
  } else {
    color = "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900";
  }

  // Цвет счётчика чуть отличается, чтобы был визуально вторичен по
  // отношению к подписи. На активном чипсе счётчик тоже белый, но
  // полупрозрачный — так читается «свой» текст и «вторичная цифра».
  const countClass = isActive ? "text-white/70" : "text-zinc-500";

  return (
    <Link href={href} className={`${base} ${color}`}>
      <span>{label}</span>
      <span className={`text-xs ${countClass}`}>{count}</span>
    </Link>
  );
}
