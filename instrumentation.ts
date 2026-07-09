// Next.js вызывает register() один раз при старте сервера.
// Ставим «сеть безопасности»: перехватываем необработанные ошибки промисов и
// исключения и просто логируем их, а не роняем процесс. Иначе одна случайная
// ошибка (например, сбой записи кеша картинок на хостинге) завершает Node,
// платформа шлёт SIGTERM и перезапускает контейнер — сайт уходит в цикл
// перезапусков и не работает.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.on("unhandledRejection", (reason) => {
      console.error("[instrumentation] unhandledRejection:", reason);
    });
    process.on("uncaughtException", (err) => {
      console.error("[instrumentation] uncaughtException:", err);
    });
  }
}
