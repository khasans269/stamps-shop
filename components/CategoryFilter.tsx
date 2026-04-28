import Link from "next/link";
import productsData from "@/data/products.json";
import {
  CATEGORY_NAMES_SHORT,
  CATEGORY_ORDER,
  type Category,
  type Product,
} from "@/types";

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

// Считаем количество товаров в каждой категории один раз на модуль —
// эти данные статичны на этапе билда (products.json не меняется в рантайме).
const allProducts = productsData.products as Product[];
const totalCount = allProducts.length;
const countByCategory: Record<Category, number> = {
  "alphabets-cyrillic": 0,
  "alphabets-latin": 0,
  patterns: 0,
  rollers: 0,
  tools: 0,
};
for (const product of allProducts) {
  countByCategory[product.category] += 1;
}

export function CategoryFilter({ active }: Props) {
  return (
    <nav
      // role+aria-label делают этот блок понятным скринридерам как «фильтр».
      aria-label="Фильтр по категориям"
      className="mb-8 flex flex-wrap gap-2"
    >
      <Chip href="/catalog" label="Все" count={totalCount} isActive={active === null} />
      {CATEGORY_ORDER.map((category) => (
        <Chip
          key={category}
          href={`/catalog/${category}`}
          label={CATEGORY_NAMES_SHORT[category]}
          count={countByCategory[category]}
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
