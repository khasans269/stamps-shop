// Базовый адрес сайта — единый источник правды для sitemap, robots,
// canonical-ссылок и Open Graph. Берём из env NEXT_PUBLIC_SITE_URL (удобно
// для preview/локали), с запасным значением — боевой домен. Хвостовой слэш
// срезаем, чтобы при склейке не получалось "https://site//catalog".
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
  "https://askarceramics.ru";
