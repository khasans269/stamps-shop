"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import productsData from "@/data/products.json";
import type { Product } from "@/types";

const allProducts = productsData.products as Product[];

// Минимальная сумма заказа в рублях. Подсказка показывается на чекауте,
// но первичная блокировка кнопки "К оформлению" — на странице корзины.
const MIN_ORDER_TOTAL = 500;

// Способы доставки. Используются и как value (передаём дальше), и как
// человекочитаемая подпись.
const DELIVERY_OPTIONS = [
  { value: "cdek", label: "СДЭК (до пункта выдачи)" },
  { value: "yandex", label: "Яндекс Доставка (курьер или ПВЗ)" },
  { value: "ozon", label: "Озон Доставка (до пункта выдачи)" },
] as const;

type DeliveryValue = (typeof DELIVERY_OPTIONS)[number]["value"];

// Минимальная валидация телефона: считаем цифры. Если 10 или 11 — ок.
// Ловить редкие форматы вроде "+44" не нужно — у нас только Россия.
function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

// Простая проверка email — наличие @ и точки после неё. Полную RFC
// валидацию делать не нужно; реальную проверку сделает почтовик.
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function CheckoutClient() {
  const router = useRouter();
  const { items, totalCount } = useCart();

  // Собираем строки заказа по тем же правилам, что в корзине: только
  // НЕ pending товары, иначе пользователь оплатит то, что вот-вот удалится.
  const orderRows = useMemo(() => {
    return items
      .map((item) => {
        const product = allProducts.find((p) => p.id === item.productId);
        if (!product) return null;
        return { product, quantity: item.quantity };
      })
      .filter(
        (row): row is { product: Product; quantity: number } => row !== null
      );
  }, [items]);

  const totalPrice = orderRows.reduce(
    (sum, { product, quantity }) => sum + product.price * quantity,
    0
  );

  // ── Состояние формы ─────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState<DeliveryValue>("cdek");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [agree, setAgree] = useState(false);

  // Ошибки валидации по полям. Заполняются при попытке отправки.
  // null — поле ещё не валидировалось / прошло валидацию.
  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    agree?: string;
    total?: string;
  }>({});

  const [submitting, setSubmitting] = useState(false);
  // Ошибка от сервера/сети при отправке — отдельно от ошибок полей,
  // потому что относится не к конкретному инпуту, а ко всей попытке.
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Если корзина пустая (например, человек открыл чекаут напрямую по URL
  // или вкладку, где корзина успела очиститься) — отправляем обратно в
  // каталог. useEffect, чтобы не дёргать router во время рендера.
  useEffect(() => {
    if (orderRows.length === 0) {
      router.replace("/cart");
    }
  }, [orderRows.length, router]);

  function validate(): boolean {
    const next: typeof errors = {};

    if (name.trim().length < 2) {
      next.name = "Укажите имя получателя";
    }
    if (!isValidPhone(phone)) {
      next.phone = "Телефон должен содержать 10 или 11 цифр";
    }
    if (!isValidEmail(email)) {
      next.email = "Введите корректный email";
    }
    if (address.trim().length < 5) {
      next.address = "Укажите адрес или пункт выдачи";
    }
    if (!agree) {
      next.agree = "Подтвердите согласие, без него мы не можем принять заказ";
    }
    if (totalPrice < MIN_ORDER_TOTAL) {
      next.total = `Минимальная сумма заказа — ${MIN_ORDER_TOTAL} ₽`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const deliveryLabel =
      DELIVERY_OPTIONS.find((o) => o.value === delivery)?.label ?? delivery;

    // Тело запроса. Номер заказа сервер сгенерирует сам и вернёт нам
    // в ответе — поэтому здесь его нет.
    const requestBody = {
      contact: {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
      },
      delivery: {
        method: delivery,
        methodLabel: deliveryLabel,
        address: address.trim(),
      },
      comment: comment.trim() || null,
      items: orderRows.map(({ product, quantity }) => ({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
        sum: product.price * quantity,
      })),
      total: totalPrice,
    };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      // Тип ответа сервера: { ok, orderId?, error?, channels? }.
      const data = (await res
        .json()
        .catch(() => ({}))) as {
        ok?: boolean;
        orderId?: string;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.orderId) {
        setSubmitError(
          data.error ??
            "Не удалось отправить заявку. Попробуйте ещё раз через минуту или напишите мне напрямую."
        );
        setSubmitting(false);
        return;
      }

      // Заказ успешно принят — сохраняем полную копию (вместе с
      // серверным orderId) в sessionStorage, чтобы /checkout/success
      // показал детали без повторного запроса.
      const orderForSuccess = {
        ...requestBody,
        orderId: data.orderId,
        createdAt: new Date().toISOString(),
      };
      try {
        sessionStorage.setItem(
          "stamps-shop-last-order",
          JSON.stringify(orderForSuccess)
        );
      } catch {
        // если sessionStorage недоступен — success-страница покажет
        // заглушку с номером заказа из URL.
      }

      // Корзину НЕ чистим тут — это сделает success-страница, чтобы
      // при возврате назад человек не увидел внезапно пустую корзину.
      router.push(`/checkout/success?order=${data.orderId}`);
    } catch (err) {
      // Сюда попадаем при сетевой ошибке (нет интернета, CORS, и т.п.).
      console.error("checkout submit failed", err);
      setSubmitError(
        "Похоже, нет связи с сервером. Проверьте интернет и попробуйте ещё раз."
      );
      setSubmitting(false);
    }
  }

  // Пока эффект редиректа не отработал — отдаём пустой блок.
  if (orderRows.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold md:text-4xl">Оформление заказа</h1>
      <p className="mb-8 text-zinc-500">
        {totalCount} товара на сумму{" "}
        <span className="font-medium text-zinc-900">
          {totalPrice.toLocaleString("ru-RU")} ₽
        </span>
      </p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
        {/* ── Контактные данные ──────────────────────────────────────── */}
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-xl font-semibold text-zinc-900">
            Контактные данные
          </legend>

          <Field
            label="Имя и фамилия"
            error={errors.name}
            required
          >
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
              placeholder="Например, Анна Иванова"
            />
          </Field>

          <Field
            label="Телефон"
            error={errors.phone}
            hint="С номера, по которому проще всего связаться. Пишу в Telegram/WhatsApp по этому же номеру."
            required
          >
            <input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
              placeholder="+7 (___) ___-__-__"
            />
          </Field>

          <Field
            label="Email"
            error={errors.email}
            hint="На этот адрес придёт чек после оплаты."
            required
          >
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
              placeholder="vasya@example.com"
            />
          </Field>
        </fieldset>

        {/* ── Доставка ───────────────────────────────────────────────── */}
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-xl font-semibold text-zinc-900">
            Доставка
          </legend>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-zinc-700">
              Способ доставки <span className="text-red-600">*</span>
            </p>
            <div className="flex flex-col gap-2">
              {DELIVERY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                    delivery === opt.value
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery"
                    value={opt.value}
                    checked={delivery === opt.value}
                    onChange={() => setDelivery(opt.value)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              Точную стоимость доставки сообщу при подтверждении заказа — она
              зависит от вашего города и веса посылки.
            </p>
          </div>

          <Field
            label="Адрес доставки или пункт выдачи"
            error={errors.address}
            hint="Город, улица, дом, квартира — или адрес ПВЗ выбранной службы."
            required
          >
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="min-h-[80px] w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
              placeholder="Москва, ул. Тверская, 1, кв. 5 — или СДЭК г. Казань, ул. Баумана, 10"
            />
          </Field>

          <Field label="Комментарий" hint="Если есть пожелания по упаковке или индивидуальному заказу.">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[80px] w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
              placeholder="Например: подарок, добавьте открытку"
            />
          </Field>
        </fieldset>

        {/* ── Состав заказа ──────────────────────────────────────────── */}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-xl font-semibold text-zinc-900">
            Состав заказа
          </legend>
          <ul className="rounded-2xl border border-zinc-200 bg-zinc-50">
            {orderRows.map(({ product, quantity }) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">
                    {product.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {quantity} × {product.price.toLocaleString("ru-RU")} ₽
                  </p>
                </div>
                <p className="flex-shrink-0 text-sm font-semibold">
                  {(product.price * quantity).toLocaleString("ru-RU")} ₽
                </p>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between px-4 pt-2">
            <span className="text-zinc-500">Итого товаров</span>
            <span className="text-2xl font-semibold">
              {totalPrice.toLocaleString("ru-RU")} ₽
            </span>
          </div>
          {errors.total && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {errors.total}
            </p>
          )}
          <p className="px-4 text-xs text-zinc-500">
            Стоимость доставки рассчитываю отдельно, после согласования адреса.
          </p>
        </fieldset>

        {/* ── Согласие ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-1 h-4 w-4 flex-shrink-0"
            />
            <span className="text-zinc-700">
              Соглашаюсь с условиями{" "}
              <Link
                href="/legal/oferta"
                className="text-zinc-900 underline hover:text-zinc-700"
                target="_blank"
              >
                договора-оферты
              </Link>{" "}
              и{" "}
              <Link
                href="/legal/privacy"
                className="text-zinc-900 underline hover:text-zinc-700"
                target="_blank"
              >
                политики конфиденциальности
              </Link>
              , даю согласие на обработку персональных данных для оформления
              заказа.
            </span>
          </label>
          {errors.agree && (
            <p className="text-sm text-red-600 ml-7">{errors.agree}</p>
          )}
        </div>

        {/* ── Ошибка отправки (от сервера/сети) ─────────────────────── */}
        {submitError && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {submitError}
          </p>
        )}

        {/* ── Кнопка отправки ───────────────────────────────────────── */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-zinc-900 px-6 py-4 text-base font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:self-start"
        >
          {submitting ? "Отправляю заявку…" : "Отправить заявку"}
        </button>

        <p className="text-xs text-zinc-500">
          После отправки я свяжусь с вами в течение рабочего дня — уточним
          стоимость доставки, готовый итог и пришлю реквизиты для оплаты.
        </p>
      </form>
    </div>
  );
}

// ── Вспомогательный компонент: поле формы с подписью, ошибкой и подсказкой ─
// Чтобы каждое поле не повторяло одни и те же три блока вокруг input.
function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="text-xs text-zinc-500">{hint}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </label>
  );
}
