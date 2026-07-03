import Link from "next/link";
import productsData from "@/data/products.json";
import {
  TAG_NAMES,
  TAG_ORDER,
  type Category,
  type Product,
  type Tag,
} from "@/types";

// Серверный компонент: рисует чипсы тегов под рядом категорий.
// Принимает текущую категорию (чтобы посчитать товары в ней с каждым
// тегом) и активный тег (или null, если фильтр не выбран).
//
// Логика отображения:
//  - Показываем только теги, у которых в текущей категории есть хотя бы
//    один товар. Если в категории не одного товара с тегом нет —
//    компонент возвращает null и не занимает места.
//  - Чип «Все» переводит обратно на страницу категории без ?tag=.
//  - Активный чип — тёмный, остальные — светлые с рамкой.

interface Props {
  category: Category;
  active: Tag | null;
}

const allProducts = productsData.products as Product[];

export function TagFilter({ category, active }: Props) {
  // Считаем количество товаров в этой категории по каждому тегу.
  const productsInCategory = allProducts.filter((p) => p.category === category);
  const countByTag: Partial<Record<Tag, number>> = {};
  for (const product of productsInCategory) {
    if (!product.tags) continue;
    for (const tag of product.tags) {
      countByTag[tag] = (countByTag[tag] ?? 0) + 1;
    }
  }

  // Оставляем только теги, у которых есть хоть один товар в категории.
  const visibleTags = TAG_ORDER.filter((tag) => (countByTag[tag] ?? 0) > 0);

  // Если в этой категории не один тег не применим — не показываем фильтр.
  // Это бережёт место и не путает пользователя пустым «фильтром ни о чём».
  if (visibleTags.length === 0) {
    return null;
  }

  const totalCount = productsInCategory.length;

  return (
    <nav
      aria-label="Фильтр по характеристикам"
      className="mb-8 flex flex-wrap gap-2"
    >
      {/* Чип «Все» — снимает выбранный тег, возвращая на категорию */}
      <Chip
        href={`/catalog/${category}`}
        label="Все"
        count={totalCount}
        isActive={active === null}
      />
      {visibleTags.map((tag) => (
        <Chip
          key={tag}
          href={`/catalog/${category}?tag=${tag}`}
          label={TAG_NAMES[tag]}
          count={countByTag[tag] ?? 0}
          isActive={active === tag}
        />
      ))}
    </nav>
  );
}

// Тот же визуальный стиль чипса, что в CategoryFilter — чтобы два ряда
// фильтров смотрелись как единая система. Выделен в отдельный компонент,
// чтобы не плодить тернарников в JSX.
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
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors";
  const color = isActive
    ? "bg-zinc-900 text-white"
    : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900";
  const countClass = isActive ? "text-white/70" : "text-zinc-500";

  return (
    <Link href={href} className={`${base} ${color}`}>
      <span>{label}</span>
      <span className={`text-xs ${countClass}`}>{count}</span>
    </Link>
  );
}
