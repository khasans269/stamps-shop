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

// ── Розничная цена доставки СДЭК (что видит покупатель) ──────────────────────
// Базовую цену считает виджет СДЭК (тариф 136 «Посылка склад-склад»). Поверх
// неё закладываем реальные расходы продавца, чтобы доставка их полностью
// покрывала. Значения — со слов продавца, проверить на реальных отправках.
export const CDEK_MARKUP = {
  ndsRate: 0.05, // НДС СДЭК: доля от базовой цены тарифа (285 → +14.25)
  insuranceRate: 0.0105, // страховка: доля от суммы заказа (товаров)
  insuranceFreeUpTo: 1000, // объявленная ценность до этой суммы — страховка 0
  packagingRub: 15, // упаковка, ₽
  taxRate: 0.04, // НПД 4% (продажи физлицам) — грос-ап, чтобы налог не съедал расходы
};

// Итоговая цена доставки для покупателя из базовой цены тарифа СДЭК и суммы
// заказа (товаров). Округляем вверх до рубля, чтобы продавец не оставался в минусе.
export function cdekRetailDeliveryPrice(
  baseRub: number,
  orderSumRub: number
): number {
  const nds = baseRub * CDEK_MARKUP.ndsRate;
  const insurance =
    orderSumRub > CDEK_MARKUP.insuranceFreeUpTo
      ? orderSumRub * CDEK_MARKUP.insuranceRate
      : 0;
  const cost = baseRub + nds + insurance + CDEK_MARKUP.packagingRub;
  return Math.ceil(cost / (1 - CDEK_MARKUP.taxRate));
}

// Розничная цена доставки Яндекса. В отличие от СДЭК, цена Яндекса УЖЕ включает
// их НДС и страховку (сумму заказа передаём как оценочную стоимость, от неё
// считается страховка). Поэтому НДС и страховку повторно НЕ добавляем — только
// то, чего у Яндекса нет: упаковку продавца и гросс-ап под НПД 4%.
export function yandexRetailDeliveryPrice(yandexBaseRub: number): number {
  const cost = yandexBaseRub + CDEK_MARKUP.packagingRub;
  return Math.ceil(cost / (1 - CDEK_MARKUP.taxRate));
}
