"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/context/CartContext";

// Структура заказа, которую CheckoutClient сохраняет в sessionStorage перед
// редиректом на оплату. Читает её только эта страница.
interface OrderPayload {
  orderId: string;
  // id платежа в ЮKassa — по нему проверяем реальный статус оплаты.
  paymentId?: string | null;
  createdAt: string;
  contact: {
    name: string;
    phone: string;
    email: string;
    telegram?: string | null;
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
  deliveryFee?: number;
  total: number;
}

const STORAGE_KEY = "stamps-shop-last-order";

// Статус оплаты для рендера страницы.
type PayStatus = "loading" | "succeeded" | "pending" | "canceled" | "unknown";

export function SuccessClient() {
  const searchParams = useSearchParams();
  const orderIdFromUrl = searchParams.get("order");
  const { clearCart, items } = useCart();

  const [order, setOrder] = useState<OrderPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [payStatus, setPayStatus] = useState<PayStatus>("loading");

  // Чтение заказа из sessionStorage (один раз при маунте).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OrderPayload;
        if (!orderIdFromUrl || parsed.orderId === orderIdFromUrl) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setOrder(parsed);
        }
      }
    } catch {
      // битые данные — покажем общий месседж
    }
    setLoaded(true);
  }, [orderIdFromUrl]);

  // Проверка реального статуса оплаты у ЮKassa (покупатель мог вернуться,
  // не заплатив). Пока pending — пара автоповторов.
  useEffect(() => {
    if (!loaded || !order) return;
    const paymentId = order.paymentId;
    if (!paymentId) {
      // Нет id платежа (старая запись) — статус не проверить.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPayStatus("unknown");
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const check = async () => {
      try {
        const r = await fetch(
          `/api/payment/status?paymentId=${encodeURIComponent(paymentId)}`
        );
        const d = (await r.json()) as { status?: string | null };
        if (cancelled) return;
        if (d.status === "succeeded") {
          setPayStatus("succeeded");
          return;
        }
        if (d.status === "canceled") {
          setPayStatus("canceled");
          return;
        }
        if (d.status === "pending" || d.status === "waiting_for_capture") {
          setPayStatus("pending");
          attempts += 1;
          if (attempts < 4) setTimeout(check, 3000);
          return;
        }
        setPayStatus("unknown");
      } catch {
        if (!cancelled) setPayStatus("unknown");
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [loaded, order]);

  // Корзину и черновик формы чистим ТОЛЬКО при подтверждённой оплате —
  // иначе при отмене покупатель потерял бы товары и не смог оплатить снова.
  useEffect(() => {
    if (payStatus !== "succeeded") return;
    if (!order) return;
    if (items.length === 0) return;
    const flagKey = `stamps-shop-cleared-${order.orderId}`;
    if (sessionStorage.getItem(flagKey) === "1") return;
    clearCart();
    try {
      localStorage.removeItem("stamps-shop-checkout-form");
    } catch {
      // localStorage недоступен — не критично.
    }
    sessionStorage.setItem(flagKey, "1");
  }, [payStatus, order, items.length, clearCart]);

  // Пока читаем sessionStorage.
  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-zinc-500">Загружаю данные заказа…</p>
      </div>
    );
  }

  // Нет данных заказа (прямой заход по ссылке) — общий месседж.
  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="mb-4 text-3xl font-bold">Спасибо за заказ!</h1>
        <p className="mb-8 text-zinc-500">
          Как только оплата подтвердится, я получу заказ и свяжусь с вами.
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

  // Проверяем статус оплаты.
  if (payStatus === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-zinc-500">Проверяем статус оплаты…</p>
      </div>
    );
  }

  // Оплата не завершена (покупатель вышел/отменил).
  if (payStatus === "canceled") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="mb-4 text-3xl font-bold text-zinc-900">
          Оплата не завершена
        </h1>
        <p className="mb-2 text-zinc-600">
          Заказ <b>{order.orderId}</b> не оплачен.
        </p>
        <p className="mb-8 text-zinc-500">
          Товары остались в корзине — можно вернуться и оплатить снова.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/cart"
            className="rounded-2xl bg-zinc-900 px-6 py-3 text-center font-medium text-white transition hover:bg-zinc-700"
          >
            Вернуться к оплате
          </Link>
          <Link
            href="/catalog"
            className="rounded-2xl border border-zinc-300 bg-white px-6 py-3 text-center text-zinc-700 transition hover:bg-zinc-50"
          >
            В каталог
          </Link>
        </div>
      </div>
    );
  }

  // Оплата ещё обрабатывается.
  if (payStatus === "pending") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="mb-4 text-3xl font-bold text-zinc-900">
          Ожидаем подтверждение оплаты…
        </h1>
        <p className="mb-2 text-zinc-600">
          Заказ <b>{order.orderId}</b>. Это может занять несколько секунд.
        </p>
        <p className="mb-8 text-zinc-500">
          Как только оплата подтвердится, я получу заказ и свяжусь с вами. Чек
          придёт на почту <b>{order.contact.email}</b>.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-2xl bg-zinc-900 px-6 py-3 font-medium text-white transition hover:bg-zinc-700"
        >
          Обновить статус
        </button>
      </div>
    );
  }

  // payStatus === "succeeded" | "unknown" — показываем сводку заказа.
  // Для "unknown" (не смогли проверить) оставляем аккуратную формулировку
  // «как только оплата подтвердится» — она не утверждает факт оплаты.
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 rounded-2xl bg-emerald-50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 md:text-3xl">
          {payStatus === "succeeded"
            ? `Спасибо, ${order.contact.name.split(" ")[0]}! Заказ оплачен`
            : `Спасибо, ${order.contact.name.split(" ")[0]}! Заказ оформлен`}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Номер заказа: <b>{order.orderId}</b>
        </p>
      </div>

      <h2 className="mb-3 text-xl font-semibold text-zinc-900">Что дальше</h2>
      <ol className="mb-10 flex flex-col gap-3 text-zinc-700">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">
            1
          </span>
          <span>
            {payStatus === "succeeded"
              ? "Я получил ваш заказ. "
              : "Как только оплата подтвердится, я получу заказ. "}
            Чек придёт на почту <b>{order.contact.email}</b>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">
            2
          </span>
          <span>
            Собираю и упаковываю ваш заказ. Если понадобится уточнить детали —
            свяжусь по телефону <b>{order.contact.phone}</b>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">
            3
          </span>
          <span>
            Отправляю заказ службой <b>{order.delivery.methodLabel}</b> и
            присылаю трек-номер.
          </span>
        </li>
      </ol>

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
        {typeof order.deliveryFee === "number" && order.deliveryFee > 0 && (
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm">
            <span className="text-zinc-500">Доставка</span>
            <span className="font-medium">
              {order.deliveryFee.toLocaleString("ru-RU")} ₽
            </span>
          </div>
        )}
        <div className="flex items-center justify-between bg-zinc-50 px-4 py-3">
          <span className="text-zinc-500">
            {payStatus === "succeeded" ? "Итого оплачено" : "Итого к оплате"}
          </span>
          <span className="text-xl font-semibold">
            {order.total.toLocaleString("ru-RU")} ₽
          </span>
        </div>
      </div>

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
