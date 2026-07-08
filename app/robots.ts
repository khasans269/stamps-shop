import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// robots.txt генерируется Next.js автоматически из этого файла и доступен
// по адресу /robots.txt. Разрешаем индексировать всё, кроме служебных
// разделов (корзина, оформление, API) — им в поиске делать нечего.
// Заодно указываем поисковику ссылку на sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/cart", "/checkout", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
