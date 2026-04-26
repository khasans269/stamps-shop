"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/types";

// Длительность окна "отмены" — должна совпадать с UNDO_TIMEOUT_MS в CartContext.
// Используется только для отрисовки прогресса (полная заливка = 5 секунд).
const TOTAL_MS = 5000;

// Inline-плашка, которая занимает место удалённого товара в списке корзины.
// Визуально:
//   - В фоне всей строки — красноватая заливка, ширина которой плавно
//     уменьшается слева направо по мере истечения таймера.
//   - На месте фото товара — большая цифра обратного отсчёта.
//   - Текст "Вы удалили ..." и кнопка "Вернуть".
//
// Высоту делаем такой же, как у обычной строки корзины (фото 80×80 +
// тот же padding), чтобы при удалении layout не прыгал.
export function PendingRow({
  product,
  expiresAt,
  onRestore,
}: {
  product: Product;
  expiresAt: number;
  onRestore: () => void;
}) {
  // Текущее время — обновляем каждые 100 мс для плавной анимации заливки.
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [expiresAt]);

  // Сколько мс осталось. Защищаемся от выхода за [0..TOTAL_MS].
  const msLeft = Math.max(0, Math.min(TOTAL_MS, expiresAt - now));
  // Округление вверх: пока есть хоть мс — показываем "1", не "0".
  const secondsLeft = Math.ceil(msLeft / 1000);
  // Доля оставшегося времени (1 → 0). Используется как ширина заливки:
  // в начале занимает всю строку, к концу таймера сжимается до нуля.
  const ratio = msLeft / TOTAL_MS;

  return (
    <li
      // relative — точка отсчёта для абсолютного позиционирования заливки.
      // px-2 — небольшой "воздух" слева и справа, чтобы заливка не упиралась
      // в края строки и квадрат с цифрой не казался "срезанным".
      className="relative flex items-center gap-4 border-b border-zinc-200 px-2 py-4"
      aria-live="polite"
    >
      {/* Заливка-фон. Изначально занимает всю ширину строки и постепенно
          сжимается слева направо до нуля. Закруглённые углы и небольшие
          отступы сверху/снизу — чтобы выглядела как карточка-акцент,
          а не сплошной кровоподтёк через всю строку. */}
      <div
        className="pointer-events-none absolute inset-y-2 left-2 rounded-xl bg-red-100"
        style={{
          // (100% строки минус 16px на боковые отступы) * ratio
          width: `calc((100% - 1rem) * ${ratio})`,
          // Плавная анимация между тиками (100 мс между ре-рендерами).
          transition: "width 100ms linear",
        }}
        aria-hidden="true"
      />

      {/* Цифра отсчёта на месте фото товара. relative — чтобы быть поверх
          заливки. Белый фон у плашки — чтобы она "вырезала" цифру из заливки
          и та читалась независимо от того, добежала ли заливка до неё.
          ml-2 — воздух между левым краем заливки и квадратом, чтобы цифра
          не выглядела впритирку к красному. */}
      <div className="relative ml-2 flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-white">
        <span className="text-3xl font-semibold tabular-nums text-red-700">
          {secondsLeft}
        </span>
      </div>

      {/* Текст про удалённый товар. relative — чтобы был поверх заливки. */}
      <div className="relative min-w-0 flex-1">
        <p className="line-clamp-2 text-sm text-zinc-500">
          Вы удаляете{" "}
          <span className="font-medium text-zinc-700">&quot;{product.name}&quot;</span>
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Через {secondsLeft} {pluralizeSeconds(secondsLeft)} товар будет
          удалён окончательно
        </p>
      </div>

      {/* Кнопка отмены. relative — поверх заливки. mr-2 — симметричный
          воздух справа, чтобы при полной заливке кнопка не упиралась
          в правый край красной полосы. */}
      <button
        type="button"
        onClick={onRestore}
        className="relative mr-2 flex-shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
      >
        Вернуть
      </button>
    </li>
  );
}

// Простое склонение для русского "секунда / секунды / секунд".
function pluralizeSeconds(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "секунду";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "секунды";
  return "секунд";
}
