// Единая точка доступа к товарам и категориям для всего сайта.
//
// Зачем отдельный файл: логику «какие товары показывать» и «какие
// категории показывать» нельзя размазывать по страницам — иначе легко
// забыть отфильтровать скрытый товар в одном месте. Здесь она одна.

import productsData from "@/data/products.json";
import { CATEGORY_ORDER, type Category, type Product } from "@/types";

// Все товары как есть, включая скрытые (hidden: true). Нужен редко —
// в основном для служебных подсчётов. На витрине используем visibleProducts.
export const allProducts = productsData.products as Product[];

// Товары, которые реально показываем покупателю: без скрытых.
export const visibleProducts = allProducts.filter((p) => !p.hidden);

// Найти видимый товар по slug. Скрытые не находятся — страница отдаст 404.
export function findVisibleProduct(slug: string): Product | undefined {
  return visibleProducts.find((p) => p.slug === slug);
}

// Сколько ВИДИМЫХ товаров в каждой категории.
export const visibleCountByCategory: Record<Category, number> = {
  "alphabets-cyrillic": 0,
  "alphabets-latin": 0,
  patterns: 0,
  rollers: 0,
  tools: 0,
};
for (const product of visibleProducts) {
  visibleCountByCategory[product.category] += 1;
}

// Категории, которые показываем в интерфейсе: только те, где есть хотя бы
// один видимый товар. Пустые (например, «Узоры» и «Ролики», пока не
// наполнены) сами не показываются и сами появятся, когда добавишь товар.
export const visibleCategories: Category[] = CATEGORY_ORDER.filter(
  (category) => visibleCountByCategory[category] > 0,
);
