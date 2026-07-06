// Параметры посылки для расчёта доставки: вес и габариты.
//
// Расчёт стоимости (Яндекс Доставка) требует вес и размеры посылки. У
// товаров в products.json веса нет, поэтому берём вес по КАТЕГОРИИ товара
// (решение владельца). Значения ниже — прикидочные, подставь реальные,
// когда взвесишь типовые товары. Вес — в граммах.

import type { Category } from "@/types";
import { allProducts } from "@/lib/products";

// Вес одной единицы товара по категории, граммы. ⚠️ Ориентировочно —
// уточни реальными замерами. Лучше слегка завысить, чем занизить (иначе
// служба может пересчитать дороже при приёме).
export const CATEGORY_WEIGHT_GRAMS: Record<Category, number> = {
  "alphabets-cyrillic": 300, // набор штампов-алфавит в кейсе
  "alphabets-latin": 300,
  patterns: 120, // отдельный штамп с узором
  rollers: 180, // текстурный ролик
  tools: 150, // инструмент
};

// Если у товара категории нет в карте (не должно случаться) — этот вес.
const FALLBACK_ITEM_GRAMS = 200;

// Вес упаковки/коробки, добавляется к суммарному весу товаров, граммы.
export const PACKAGING_GRAMS = 100;

// Минимальный вес посылки, граммы — службы обычно считают от какого-то
// минимума, плюс страховка от нулевого веса.
export const MIN_PARCEL_GRAMS = 300;

// Габариты посылки по умолчанию, сантиметры. Штампы небольшие — берём один
// типовой размер коробки на любой заказ. При желании позже можно считать
// размеры динамически от состава.
export const DEFAULT_PARCEL_CM = {
  length: 20,
  width: 15,
  height: 10,
};

// Суммарный вес заказа в граммах: сумма весов товаров по их категориям
// (× количество) + упаковка, но не меньше MIN_PARCEL_GRAMS.
export function getOrderWeightGrams(
  items: Array<{ productId: string; quantity: number }>
): number {
  let grams = 0;
  for (const item of items) {
    const product = allProducts.find((p) => p.id === item.productId);
    const perItem = product
      ? CATEGORY_WEIGHT_GRAMS[product.category] ?? FALLBACK_ITEM_GRAMS
      : FALLBACK_ITEM_GRAMS;
    grams += perItem * item.quantity;
  }
  grams += PACKAGING_GRAMS;
  return Math.max(grams, MIN_PARCEL_GRAMS);
}
