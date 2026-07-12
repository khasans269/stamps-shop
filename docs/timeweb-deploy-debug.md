# Отладка деплоя на Timeweb — памятка для нового чата

## Суть проблемы (её и решаем)

Переезжаем с Vercel на **Timeweb Cloud App Platform**. На **временном домене**
Timeweb (`...twc1.net`) сайт **не работает**. Домен `askarceramics.ru` пока
всё ещё указывает на Vercel — переключим только когда Timeweb заработает.

**Симптом по логам:** приложение собирается и стартует нормально, но платформа
почти сразу убивает процесс (SIGTERM), и так по кругу:

```
> stamps-shop@0.1.0 start
> next start
▲ Next.js 16.2.4
✓ Ready in 113ms
- Network: http://172.17.0.6:3000
- Local:  http://localhost:3000
npm error signal SIGTERM
npm error command failed
npm error command sh -c next start
```

То есть код НЕ падает (`✓ Ready`, слушает `0.0.0.0:3000`) — его перезапускает
сама платформа.

## Проект

- Next.js 16 (App Router), React 19, TypeScript, Tailwind v4. Node.js 24.
- Репозиторий: `khasans269/stamps-shop`, ветка `main`, автодеплой по последнему
  коммиту.
- Домен: `askarceramics.ru` (сейчас на Vercel; DNS у регистратора Timeweb).

## Настройка приложения в Timeweb

- Тип: **Frontend → Next.js**, включена **поддержка SSR** (режим backend-приложения).
- Регион: **Москва (MSK-1)**. Конфигурация: **1 CPU, 2 ГБ RAM, 30 ГБ NVMe** (~810 ₽/мес).
- Команда сборки: `npm run build`
- Команда запуска: `npm start` (в `package.json` → `"start": "next start"` — это
  ПРОДАКШН-сервер, лог это подтверждает; менять НЕ нужно).
- Директория сборки: очищена (было ошибочно `/out` — это для static export, не для SSR).
- Путь до директории проекта: пусто (репозиторий в корне).

## Переменные окружения, заданные в Timeweb

Обязательные заданы: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`,
`YANDEX_MAPS_API_KEY`, `NEXT_PUBLIC_YANDEX_METRIKA_ID=110503197`,
`NEXT_PUBLIC_SITE_URL=https://askarceramics.ru`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `SHEETS_WEBHOOK_URL`.
`CDEK_ACCOUNT` / `CDEK_SECRET` / `CDEK_API_BASE` — пустые (= тестовый режим СДЭК,
так и задумано на этом этапе). `DELIVERY_FLAT_FEE`, `YOOKASSA_SEND_RECEIPT` — пусто.

## Что уже сделано (закоммичено в main)

1. **`next.config.ts` → `images: { unoptimized: true }`.**
   Причина: рантайм не мог писать в `/app/.next/cache/images`
   (`EACCES: permission denied, mkdir`), из-за чего Next оптимизировал каждое
   фото заново на каждый запрос → `unhandledRejection` → падение процесса.
   После этой правки ошибок EACCES/картинок в логе **больше нет**. ✓
2. **`instrumentation.ts`** — перехват `unhandledRejection` / `uncaughtException`
   (логируем, не роняем процесс).
3. **`app/api/health/route.ts`** — GET, всегда отдаёт `200 "ok"`, для healthcheck.

## Что уже исключено

- **Оптимизация картинок (EACCES)** — починена, из логов ушла.
- **Команда запуска** — правильная (`npm start` = `next start`, продакшн,
  подтверждено логом `✓ Ready`). Рекомендация TimewebGPT «сменить на `npx next
  start`» — неверна, это то же самое, тупик.

## Главная рабочая гипотеза: проваленный healthcheck

Из доки Timeweb (`/docs/apps/healthcheck-path`): после запуска платформа каждые
30 секунд шлёт GET на «Путь проверки состояния»; если **3 раза подряд не 2xx —
приложение автоматически перезапускается** (это и есть наш SIGTERM-цикл).

Скорее всего в поле «Путь проверки состояния» стоял путь, которого у нас нет
(`/health`, `/status`, `/ping`) → 404 → провал → перезапуск.

**Что нужно сделать/проверить:**
1. Запушить `/api/health` (если ещё не задеплоен) и убедиться, что на временном
   домене `https://<temp>.twc1.net/api/health` реально отдаёт **200 "ok"**.
2. В Timeweb: приложение → «Настройки» → «Настройки деплоя» → «Редактировать» →
   **«Путь проверки состояния» = `/api/health`** → сохранить (пойдёт передеплой).
3. Уточнить, что стояло в этом поле ДО этого (если пусто — healthcheck не
   причина, см. ниже).

## Если healthcheck не помог — что проверять дальше

1. **Порт.** Лог показывает `:3000`. Убедиться, что Timeweb ожидает приложение
   именно на 3000, либо что он инжектит `PORT` (тогда `next start` его подхватит).
   Если платформа маршрутизирует на другой порт — базовая проверка не проходит.
   Проверить доки: `/docs/apps/how-it-works`, `/docs/apps/deploying-backend-applications/express`.
   При необходимости — команда запуска `npx next start -p $PORT` или задать `PORT`.
2. **Прямые проверки на временном домене:** открыть `/` и `/api/health`, посмотреть
   HTTP-код. Если `/` даёт 500 (SSR-ошибка из-за отсутствующей env) — это тоже
   валит healthcheck, если он указывает на `/`.
3. **Свежий полный лог деплоя + лог приложения** (не старые строки). Искать любые
   новые ошибки после `✓ Ready`.
4. **Память/OOM** — маловероятно (SIGTERM, а не SIGKILL; 2 ГБ), но не исключать при
   всплесках.
5. **Чистая пересборка** — на случай кеша сборки Timeweb (пересобрать без кеша).

## Ключевые файлы

- `next.config.ts` — `images.unoptimized: true`, security-заголовки.
- `instrumentation.ts` — перехват необработанных ошибок.
- `app/api/health/route.ts` — эндпоинт healthcheck (200).
- `package.json` — `"start": "next start"`.

## После того как Timeweb заработает

1. Проверить на временном домене: страницы, `/checkout`, карта СДЭК
   (карта заработает на боевом домене — `askarceramics.ru` уже в белом списке
   Referer ключа Яндекса; на temp-домене — только если добавить `*.twc1.net`).
2. Привязать домен `askarceramics.ru` к приложению Timeweb, переключить DNS
   (A-запись) с Vercel на Timeweb, дождаться SSL.
3. В кабинете ЮKassa обновить адрес сайта и webhook на
   `https://askarceramics.ru/api/payment/webhook` (домен, не vercel).
4. Отвязать домен от Vercel.
5. Отдельно (не срочно): сжать фото в `public/images/individual/` (сейчас ~43 МБ,
   отдаются в полном размере, т.к. оптимизация выключена — `unoptimized`).
