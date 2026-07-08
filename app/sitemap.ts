import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { visibleProducts } from "@/lib/products";
import { CATEGORY_ORDER } from "@/types";

// sitemap.xml генерируется Next.js из этого файла и доступен по /sitemap.xml.
// Перечисляем все страницы, которые полезно индексировать: главная, каталог,
// страницы категорий, карточки товаров, контакты и юр-страницы. Служебные
// (корзина, чекаут) намеренно не включаем — они закрыты и в robots.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Статические страницы. priority — подсказка о важности (0..1),
  // changeFrequency — как часто меняется содержимое.
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/catalog`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/contacts`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/legal/oferta`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Страницы категорий — по одной на каждую категорию из каталога.
  const categoryPages: MetadataRoute.Sitemap = CATEGORY_ORDER.map((category) => ({
    url: `${SITE_URL}/catalog/${category}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Карточки товаров — только видимые (без скрытых hidden:true).
  const productPages: MetadataRoute.Sitemap = visibleProducts.map((product) => ({
    url: `${SITE_URL}/product/${product.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...categoryPages, ...productPages];
}
