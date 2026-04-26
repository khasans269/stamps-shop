"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { CartItem } from "@/types";

const STORAGE_KEY = "stamps-shop-cart";

// Сколько миллисекунд держим товар в "корзине ожидания удаления", прежде чем
// окончательно удалить. За это время пользователь может нажать "Вернуть".
const UNDO_TIMEOUT_MS = 5000;

// Строка корзины как её видит UI. Отличается от CartItem только флагом
// isPending — он говорит, нужно ли вместо обычной строки рисовать плашку
// с обратным отсчётом и кнопкой "Вернуть".
export interface CartLine extends CartItem {
  isPending: boolean;
}

interface CartContextValue {
  // Видимые товары — те, что НЕ помечены к удалению.
  // Используется в счётчике в шапке (быстрая обратная связь — счётчик
  // уменьшается сразу) и в кнопке "В корзину" на странице товара.
  items: CartItem[];
  // Все строки корзины в порядке добавления, включая pending. Для рендера
  // на странице корзины: pending-строка остаётся на своём месте, layout
  // не прыгает, пользователь видит плашку с отсчётом ровно там, где был товар.
  cartLines: CartLine[];
  // Сумма количеств по видимым товарам — для бейджа в шапке.
  totalCount: number;
  // Список productId, которые сейчас "ожидают удаления".
  pendingDeletions: string[];
  // Метка времени, когда таймер удаления истечёт. null — нет активных удалений.
  pendingExpiresAt: number | null;
  // Действия
  addItem: (productId: string) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  // Отменить удаление одного конкретного товара (кнопка "Вернуть" в его inline-плашке).
  // Если это был последний pending — таймер тоже гасится.
  cancelPendingItem: (productId: string) => void;
  // Отменить все pending-удаления одним махом (кнопка "Вернуть" в общем тосте).
  cancelPendingDeletions: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  // Полный список товаров — включая те, что ожидают удаления.
  // Эта структура — источник правды и сохраняется в localStorage.
  const [allItems, setAllItems] = useState<CartItem[]>([]);
  // ID товаров, которые помечены к удалению.
  const [pendingDeletions, setPendingDeletions] = useState<string[]>([]);
  // Когда сработает таймер. null — таймера нет.
  const [pendingExpiresAt, setPendingExpiresAt] = useState<number | null>(null);
  // Ссылка на текущий таймер — нужна, чтобы можно было его отменить.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── localStorage ──────────────────────────────────────────────────────────

  // Читаем localStorage один раз при маунте.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setAllItems(JSON.parse(stored) as CartItem[]);
      }
    } catch {
      // Если данные повреждены — просто начинаем с пустой корзины.
    }
  }, []);

  // Сохраняем в localStorage при каждом изменении товаров.
  // Pending-флаги в localStorage НЕ сохраняем — они только в памяти,
  // чтобы при перезагрузке страницы товары "вернулись" автоматически.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allItems));
  }, [allItems]);

  // При размонтировании провайдера — на всякий случай чистим таймер.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // ── Внутренние помощники ──────────────────────────────────────────────────

  // Запланировать массовое подтверждение удаления через UNDO_TIMEOUT_MS.
  // Если таймер уже был — отменяем его и ставим новый (продлеваем окно отмены).
  const scheduleConfirmation = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const expiresAt = Date.now() + UNDO_TIMEOUT_MS;
    setPendingExpiresAt(expiresAt);
    timeoutRef.current = setTimeout(() => {
      // Прошло 5 секунд — реально удаляем всё, что в pending.
      setAllItems((prev) =>
        prev.filter(
          (i) => !pendingDeletionsRef.current.includes(i.productId)
        )
      );
      setPendingDeletions([]);
      setPendingExpiresAt(null);
      timeoutRef.current = null;
    }, UNDO_TIMEOUT_MS);
  }, []);

  // Реф с актуальным значением pendingDeletions — нужен внутри setTimeout,
  // чтобы получить значение в момент срабатывания, а не в момент планирования.
  const pendingDeletionsRef = useRef<string[]>([]);
  useEffect(() => {
    pendingDeletionsRef.current = pendingDeletions;
  }, [pendingDeletions]);

  // ── Публичные действия ────────────────────────────────────────────────────

  function addItem(productId: string) {
    // Если товар сейчас "ожидает удаления" — отменяем удаление, не меняем количество.
    // Пользователь нажал "В корзину" → значит передумал удалять.
    if (pendingDeletions.includes(productId)) {
      setPendingDeletions((prev) => prev.filter((id) => id !== productId));
      return;
    }
    setAllItems((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { productId, quantity: 1 }];
    });
  }

  function removeItem(productId: string) {
    // Если товар уже в pending — не трогаем (двойного нажатия защита).
    if (pendingDeletions.includes(productId)) return;
    setPendingDeletions((prev) => [...prev, productId]);
    scheduleConfirmation();
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    // На pending-товаре менять количество смысла нет.
    if (pendingDeletions.includes(productId)) return;
    setAllItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity } : i))
    );
  }

  function clearCart() {
    // "Очистить корзину" тоже даёт окно на отмену — все видимые товары идут в pending.
    const visibleIds = allItems
      .filter((i) => !pendingDeletions.includes(i.productId))
      .map((i) => i.productId);
    if (visibleIds.length === 0) return;
    setPendingDeletions((prev) => [...prev, ...visibleIds]);
    scheduleConfirmation();
  }

  function cancelPendingItem(productId: string) {
    // Отменяем удаление конкретного товара (кнопка "Вернуть" в его плашке).
    // Если в pending больше никого нет — гасим таймер.
    setPendingDeletions((prev) => {
      const next = prev.filter((id) => id !== productId);
      if (next.length === 0) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setPendingExpiresAt(null);
      }
      return next;
    });
  }

  function cancelPendingDeletions() {
    // Сбрасываем таймер и pending-флаги — все товары возвращаются.
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setPendingDeletions([]);
    setPendingExpiresAt(null);
  }

  // ── Производные значения ──────────────────────────────────────────────────

  // Видимые товары = все, кроме помеченных к удалению. Для счётчика и
  // кнопки "В корзину" — она у pending должна показывать "Добавить в корзину",
  // чтобы клик отменил удаление.
  const items = allItems.filter(
    (i) => !pendingDeletions.includes(i.productId)
  );
  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // Все строки в естественном порядке + флаг isPending.
  // Для страницы корзины — чтобы плашка отсчёта оказывалась ровно там,
  // где был товар, без перестроения списка.
  const cartLines: CartLine[] = allItems.map((i) => ({
    ...i,
    isPending: pendingDeletions.includes(i.productId),
  }));

  return (
    <CartContext.Provider
      value={{
        items,
        cartLines,
        totalCount,
        pendingDeletions,
        pendingExpiresAt,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        cancelPendingItem,
        cancelPendingDeletions,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart должен вызываться внутри CartProvider");
  }
  return ctx;
}
