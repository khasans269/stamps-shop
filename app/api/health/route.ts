// Лёгкий эндпоинт проверки состояния для хостинга (healthcheck Timeweb).
// Всегда отвечает 200 и не зависит от БД/внешних сервисов — ровно то, что
// нужно платформе, чтобы считать приложение «живым».
// В настройках приложения Timeweb укажи «Путь проверки состояния»: /api/health

export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
