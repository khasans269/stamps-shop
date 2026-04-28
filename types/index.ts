// Категории товаров в магазине.
// ID — на латинице (используется внутри кода и в URL).
// Названия для UI — в CATEGORY_NAMES (длинное, для заголовков и meta)
// и CATEGORY_NAMES_SHORT (короткое, для чипсов фильтра).
export type Category =
  | "alphabets-cyrillic"
  | "alphabets-latin"
  | "patterns"
  | "rollers"
  | "tools";

// Полные названия — для заголовка страницы категории, meta-тегов,
// карточек товаров и любых мест, где есть пространство.
export const CATEGORY_NAMES: Record<Category, string> = {
  "alphabets-cyrillic": "Алфавиты — кириллица",
  "alphabets-latin": "Алфавиты — латиница",
  patterns: "Штампы с узорами",
  rollers: "Текстурные ролики",
  tools: "Инструменты",
};

// Короткие подписи для чипсов фильтра — там тесно.
export const CATEGORY_NAMES_SHORT: Record<Category, string> = {
  "alphabets-cyrillic": "Кириллица",
  "alphabets-latin": "Латиница",
  patterns: "Узоры",
  rollers: "Текстурные ролики",
  tools: "Инструменты",
};

// Порядок категорий в интерфейсе (на страницах каталога, в меню и т.д.).
export const CATEGORY_ORDER: Category[] = [
  "alphabets-cyrillic",
  "alphabets-latin",
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
