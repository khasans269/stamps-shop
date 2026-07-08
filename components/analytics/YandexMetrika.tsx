import Script from "next/script";

// Заготовка под Яндекс.Метрику. ID счётчика берём из переменной окружения
// NEXT_PUBLIC_YANDEX_METRIKA_ID. Пока переменная не задана — компонент
// ничего не рендерит, поэтому на localhost и в preview метрика не мешает,
// а на боевом сайте достаточно прописать ID в env — код трогать не нужно.
//
// Как включить:
//   1. Заведи счётчик на https://metrika.yandex.ru → получишь номер (например 99999999).
//   2. Добавь в переменные окружения (Vercel / Timeweb / .env.local):
//        NEXT_PUBLIC_YANDEX_METRIKA_ID=99999999
//   3. Задеплой — метрика подключится сама.
const METRIKA_ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;

export function YandexMetrika() {
  // Нет ID — ничего не подключаем.
  if (!METRIKA_ID) return null;

  return (
    <>
      {/* strategy="afterInteractive" — грузим счётчик после того, как
          страница стала интерактивной, чтобы не замедлять первую отрисовку. */}
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){
            m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < document.scripts.length; j++) {
              if (document.scripts[j].src === r) { return; }
            }
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
          })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
          ym(${METRIKA_ID}, "init", {
            clickmap: true,
            trackLinks: true,
            accurateTrackBounce: true,
            webvisor: true
          });
        `}
      </Script>
      {/* Запасной вариант для пользователей с отключённым JS. */}
      <noscript>
        <div>
          {/* Трекинг-пиксель Метрики — обязательно обычный <img>, next/image
              здесь неприменим (нужен внутри <noscript>). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
