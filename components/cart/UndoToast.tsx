"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";
import productsData from "@/data/products.json";
import type { Product } from "@/types";

const allProducts = productsData.products as Product[];

// Длительность окна "отмены" — должна совпадать с UNDO_TIMEOUT_MS в CartContext.
// Это нужно только для отрисовки прогресса (полный круг = 5 секунд).
const TOTAL_MS = 5000;

// Глобальный тост с обратным отсчётом — появляется внизу экрана, когда
// пользователь удалил товар(ы) из корзины. Пока тост виден, у пользователя
// есть 5 секунд, чтобы нажать "Вернуть" и отменить удаление.
//
// Внешний вид:
//   ┌────────────────────────────────────────────────┐
//   │  Удалён «Алфавит ...»     [Вернуть]    ◷  3   │
//   └────────────────────────────────────────────────┘
//
// Слева — текст про то, что удалили. По центру — кнопка "Вернуть".
// Справа — круговой индикатор с числом оставшихся секунд внутри.
export function UndoToast() {
  const { pendingDeletions, pendingExpiresAt, cancelPendingDeletions } =
    useCart();
  // На странице корзины удалённые строки уже показываются inline-плашкой
  // PendingRow с кнопкой "Вернуть" — там этот глобальный тост избыточен.
  const pathname = usePathname();
  const isCartPage = pathname === "/cart";

  // Текущее время — обновляем каждые 100 мс, чтобы кружок плавно уменьшался.
  // Этот интервал работает только пока тост виден (есть pendingExpiresAt),
  // чтобы не жечь батарею в фоне.
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (pendingExpiresAt === null) return;
    // Сразу синхронизируемся, чтобы первый кадр уже был корректным.
    setNow(Date.now());
    const id = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => clearInterval(id);
  }, [pendingExpiresAt]);

  // Если ничего не помечено к удалению — тост не рисуем.
  // На странице корзины тоже не рисуем — там уже есть inline-плашки.
  if (
    pendingDeletions.length === 0 ||
    pendingExpiresAt === null ||
    isCartPage
  ) {
    return null;
  }

  // Сколько миллисекунд осталось до автоматического удаления.
  // На всякий случай ограничиваем диапазоном [0..TOTAL_MS].
  const msLeft = Math.max(0, Math.min(TOTAL_MS, pendingExpiresAt - now));
  // Округляем вверх — пока есть хоть 1 мс, показываем "1". В ноль уходит
  // только когда таймер реально истёк.
  const secondsLeft = Math.ceil(msLeft / 1000);
  // Доля оставшегося времени — для прогресса (0..1).
  const ratio = msLeft / TOTAL_MS;

  // Текст тоста зависит от того, сколько товаров в pending.
  // Если один — показываем его название. Если несколько — общее количество.
  let message: string;
  if (pendingDeletions.length === 1) {
    const product = allProducts.find((p) => p.id === pendingDeletions[0]);
    message = product
      ? `Удалён «${product.name}»`
      : "Товар удалён";
  } else {
    message = `Удалено товаров: ${pendingDeletions.length}`;
  }

  // ── Расчёт SVG-кружка ────────────────────────────────────────────────────
  // Круг рисуется через stroke-dasharray: dasharray = длина окружности,
  // dashoffset = насколько "открутили" пунктир. При ratio=1 ничего не
  // открутили (полный круг), при ratio=0 — открутили всю длину (круг пустой).
  const RADIUS = 14;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset = CIRCUMFERENCE * (1 - ratio);

  return (
    <div
      // fixed снизу по центру, поверх всего сайта.
      // pointer-events-none на контейнере, auto на самом тосте — чтобы клики
      // мимо тоста (например, в углах экрана) не блокировались.
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-lg">
        {/* Текст */}
        <p className="flex-1 truncate text-sm">{message}</p>

        {/* Кнопка отмены */}
        <button
          type="button"
          onClick={cancelPendingDeletions}
          className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/20"
        >
          Вернуть
        </button>

        {/* Круговой обратный отсчёт. Кружок крутится по часовой стрелке от
            12 часов: используем transform=rotate(-90) чтобы старт был сверху. */}
        <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center">
          <svg
            viewBox="0 0 32 32"
            className="absolute inset-0 h-full w-full -rotate-90"
            aria-hidden="true"
          >
            {/* Фоновое кольцо — еле видное, чтобы было видно "сколько осталось" */}
            <circle
              cx="16"
              cy="16"
              r={RADIUS}
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="2"
              fill="none"
            />
            {/* Активная дуга — уменьшается со временем */}
            <circle
              cx="16"
              cy="16"
              r={RADIUS}
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              // Плавная анимация между тиками (тики идут раз в 100 мс).
              style={{ transition: "stroke-dashoffset 100ms linear" }}
            />
          </svg>
          <span className="text-xs font-medium tabular-nums">
            {secondsLeft}
          </span>
        </div>
      </div>
    </div>
  );
}
