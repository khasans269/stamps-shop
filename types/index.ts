// Категории товаров в магазине.
// ID — на латинице (используется внутри кода и в URL).
// Название для UI — в CATEGORY_NAMES ниже.
export type Category = "alphabets" | "patterns" | "rollers" | "tools";

export const CATEGORY_NAMES: Record<Category, string> = {
  alphabets: "Алфавиты",
  patterns: "Штампы с узорами",
  rollers: "Текстурные ролики",
  tools: "Инструменты",
};

// Порядок категорий в интерфейсе (на страницах каталога, в меню и т.д.).
export const CATEGORY_ORDER: Category[] = [
  "alphabets",
  "patterns",
  "rollers",
  "tools",
];

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  price: number; // в рублях, без копеек
  category: Category;
  description: string;
  // Массив путей к фотографиям относительно /public. Порядок имеет значение:
  // первое фото — главное, оно показывается на карточке в каталоге, и
  // открывается первым на странице товара. Остальные — в галерее.
  // Если у товара нет фото — поле просто не указывается.
  images?: string[];
  inStock: boolean;
  // Дополнительные характеристики. Опциональные — если у товара их нет,
  // поле не указывается в products.json, и на странице оно не отобразится.
  itemsInSet?: number; // количество элементов в наборе (например, 33 буквы)
  letterHeight?: string; // высота букв, строка — чтобы поддерживать "4 мм" или "4, 6 и 8 мм"
}
