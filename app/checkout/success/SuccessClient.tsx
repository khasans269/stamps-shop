"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/context/CartContext";

// Структура заказа, которую CheckoutClient сохраняет в sessionStorage перед
// редиректом сюда. Описана здесь явно, чтобы не тащить общий тип:
// success-страница — конечная точка, и эту структуру читает только она.
interface OrderPayload {
  orderId: string;
  createdAt: string;
  contact: {
    name: string;
    phone: string;
    email: string;
  };
  delivery: {
    method: string;
    methodLabel: string;
    address: string;
  };
  comment: string | null;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    sum: number;
  }>;
  total: number;
}

const STORAGE_KEY = "stamps-shop-last-order";

export function SuccessClient() {
  const searchParams = useSearchParams();
  const orderIdFromUrl = searchParams.get("order");
  const { clearCart, items } = useCart();

  // Читаем заказ из sessionStorage. Делаем это в state + useEffect, чтобы
  // SSR не пытался прочитать недоступный там sessionStorage и не сыпал
  // hydration mismatch.
  const [order, setOrder] = useState<OrderPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Это одноразовое чтение из sessionStorage на маунте — типичный
    // случай "синхронизации с внешним хранилищем", про который и говорит
    // правило react-hooks/set-state-in-effect. Альтернатива через
    // useSyncExternalStore + кэш сложнее и не оправдана для одноразовой
    // загрузки.
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OrderPayload;
        // Проверяем, что данные относятся именно к этому номеру заказа —
        // на случай, если пользователь открыл /checkout/success напрямую
        // или вернулся "Назад" к старому заказу.
        if (!orderIdFromUrl || parsed.orderId === orderIdFromUrl) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setOrder(parsed);
        }
      }
    } catch {
      // Если sessionStorage сломан или JSON битый — ничего страшного,
      // покажем заглушку.
    }
    setLoaded(true);
  }, [orderIdFromUrl]);

  // Когда заказ показан и пользователь подтвердил его — чистим корзину.
  // Делаем это однократно после того, как мы реально показали заказ,
  // чтобы при F5 на этой странице пользователь видел те же данные, а
  // не пустую корзину "из ниоткуда".
  // Используем флаг в sessionStorage, чтобы зачистка прошла только раз.
  useEffect(() => {
    if (!order) return;
    if (items.length === 0) return; // уже чисто
    const flagKey = `stamps-shop-cleared-${order.orderId}`;
    if (sessionStorage.getItem(flagKey) === "1") return;
    clearCart();
    sessionStorage.setItem(flagKey, "1");
    // ВАЖНО: clearCart переводит товары в pending-удаление. Чтобы они
    // не "вернулись", когда пользователь увидит UndoToast и нажмёт
    // "Вернуть" — мы НЕ показываем UndoToast на этой странице.
    // (UndoToast скрыт на /cart, но не на /checkout/success — в будущем
    // имеет смысл скрыть его и здесь. Пока полагаемся на то, что
    // пользователь вряд ли будет жать "Вернуть" на странице "Спасибо".)
  }, [order, items.length, clearCart]);

  // Пока читаем sessionStorage — показываем минимальный плейсхолдер.
  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-zinc-500">Загружаю данные заказа…</p>
      </div>
    );
  }

  // Если данных нет (например, пользователь зашёл по прямой ссылке
  // на /checkout/success без свежего заказа) — показываем общий месседж.
  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="mb-4 text-3xl font-bold">Спасибо за заказ!</h1>
        <p className="mb-8 text-zinc-500">
          Я получил вашу заявку и свяжусь с вами в течение рабочего дня.
          {orderIdFromUrl && (
            <>
              <br />
              Номер заказа: <b>{orderIdFromUrl}</b>
            </>
          )}
        </p>
        <Link
          href="/catalog"
          className="inline-flex items-center rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition hover:bg-zinc-700"
        >
          Вернуться в каталог
        </Link>
      </div>
    );
  }

  // ── Полная страница "Спасибо" с краткой сводкой заказа ────────────────
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Зелёная плашка-успех */}
      <div className="mb-8 rounded-2xl bg-emerald-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 md:text-3xl">
          Спасибо, {order.contact.name.split(" ")[0]}! Заявка принята
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Номер заказа: <b>{order.orderId}</b>
        </p>
      </div>

      {/* Что дальше */}
      <h2 className="mb-3 text-xl font-semibold text-zinc-900">Что дальше</h2>
      <ol className="mb-10 flex flex-col gap-3 text-zinc-700">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">
            1
          </span>
          <span>
            Я связываюсь с вами в течение рабочего дня по телефону{" "}
            <b>{order.contact.phone}</b> или почте{" "}
            <b>{order.contact.email}</b> — уточняю детали.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">
            2
          </span>
          <span>
            Согласовываем итоговую стоимость с учётом доставки и присылаю
            ссылку для оплаты или реквизиты СБП.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">
            3
          </span>
          <span>
            После получения оплаты отправляю заказ службой{" "}
            <b>{order.delivery.methodLabel}</b> и присылаю трек-номер.
          </span>
        </li>
      </ol>

      {/* Сводка заказа */}
      <h2 className="mb-3 text-xl font-semibold text-zinc-900">
        Краткая сводка
      </h2>
      <div className="mb-8 overflow-hidden rounded-2xl border border-zinc-200">
        <ul>
          {order.items.map((item) => (
            <li
              key={item.productId}
              className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
                <p className="text-xs text-zinc-500">
                  {item.quantity} × {item.price.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              <p className="flex-shrink-0 text-sm font-semibold">
                {item.sum.toLocaleString("ru-RU")} ₽
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between bg-zinc-50 px-4 py-3">
          <span className="text-zinc-500">Итого</span>
          <span className="text-xl font-semibold">
            {order.total.toLocaleString("ru-RU")} ₽
          </span>
        </div>
      </div>

      {/* Что я знаю про доставку */}
      <h2 className="mb-3 text-xl font-semibold text-zinc-900">Доставка</h2>
      <div className="mb-10 rounded-2xl border border-zinc-200 p-4 text-sm">
        <p>
          <span className="text-zinc-500">Способ:</span>{" "}
          <b>{order.delivery.methodLabel}</b>
        </p>
        <p className="mt-1">
          <span className="text-zinc-500">Адрес:</span> {order.delivery.address}
        </p>
        {order.comment && (
          <p className="mt-3 border-t border-zinc-200 pt-3">
            <span className="text-zinc-500">Комментарий:</span> {order.comment}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/catalog"
          className="rounded-2xl bg-zinc-900 px-6 py-3 text-center font-medium text-white transition hover:bg-zinc-700"
        >
          Вернуться в каталог
        </Link>
        <Link
          href="/contacts"
          className="rounded-2xl border border-zinc-300 bg-white px-6 py-3 text-center text-zinc-700 transition hover:bg-zinc-50"
        >
          Написать мастеру
        </Link>
      </div>
    </div>
  );
}
