import type { NextConfig } from "next";

// Базовые HTTP-заголовки безопасности.
// Next.js навешивает их на каждый ответ — это бесплатное «закаливание»
// сайта против ряда типичных атак на клиента.
//
// Кратко по каждому:
//   • Strict-Transport-Security — велит браузеру всегда ходить через HTTPS
//     (даже если человек явно ввёл http://). Защита от downgrade-атак.
//   • X-Frame-Options: DENY — запрещает встраивать наш сайт в iframe на
//     чужих доменах. Защита от clickjacking (когда злоумышленник
//     прячет наш сайт под прозрачной кнопкой на своём).
//   • X-Content-Type-Options: nosniff — запрещает браузеру самому
//     «угадывать» MIME-тип. Защита от MIME-sniffing атак.
//   • Referrer-Policy: strict-origin-when-cross-origin — при переходе
//     на сторонний сайт не передаём полный URL (с query/path), только
//     origin. Защита приватности пользователя.
//   • Permissions-Policy — выключаем доступ к камере, микрофону, гео и
//     прочим API, которыми сайт не пользуется. Если в будущем понадобятся,
//     явно включим — а пока пусть просто будут заблокированы.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    // 2 года, включая все поддомены. preload — для попадания в список
    // браузеров (если когда-нибудь подадим заявку), сейчас не критично.
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
];

const nextConfig: NextConfig = {
  // Отключаем встроенную оптимизацию картинок Next.js.
  // Причина: на хостинге (Timeweb App Platform) контейнер не может писать в
  // .next/cache/images (EACCES) — из-за этого Next пытался оптимизировать
  // каждое фото заново на каждый запрос (тормоза + unhandledRejection).
  // С unoptimized: true картинки отдаются напрямую как статика из /public,
  // кеш-папка не нужна. Важно держать сами файлы фото сжатыми.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // Применяем заголовки ко всем маршрутам сайта.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
