"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import productsData from "@/data/products.json";
import type { Product } from "@/types";
import { getOrderWeightGrams } from "@/lib/delivery";
import { CdekPointPicker } from "@/components/checkout/CdekPointPicker";

const allProducts = productsData.products as Product[];

// Минимальная сумма заказа в рублях. Подсказка показывается на чекауте,
// но первичная блокировка кнопки "К оформлению" — на странице корзины.
const MIN_ORDER_TOTAL = 500;

// Ключ, под которым храним черновик формы в localStorage. Тот же префикс
// "stamps-shop-", что и у корзины — так все данные магазина в одном месте.
// Нужно, чтобы введённые данные не терялись, если человек ушёл в каталог
// и вернулся на чекаут. Стираем после успешного заказа.
const FORM_STORAGE_KEY = "stamps-shop-checkout-form";

// Способы доставки. Используются и как value (передаём дальше), и как
// человекочитаемая подпись.
const DELIVERY_OPTIONS = [
  { value: "yandex-pvz", label: "Яндекс Доставка — пункт выдачи (расчёт онлайн)" },
  { value: "cdek-pvz", label: "СДЭК — пункт выдачи (расчёт онлайн)" },
  { value: "pickup", label: "Самовывоз в СПб (ст. м. Пионерская) — бесплатно" },
] as const;

// Значение способа «самовывоз». Должно совпадать с PICKUP_METHOD на сервере
// (lib/order.ts). При самовывозе доставка бесплатна и адрес не нужен.
const PICKUP_VALUE = "pickup";

// Значение способа «СДЭК ПВЗ» — с онлайн-расчётом через виджет СДЭК. Должно
// совпадать с CDEK_PVZ_METHOD на сервере (lib/order.ts).
const CDEK_PVZ_VALUE = "cdek-pvz";

// Значение способа «Яндекс ПВЗ» — онлайн-расчёт через виджет Яндекс Доставки.
// Должно совпадать с YANDEX_PVZ_METHOD на сервере (lib/order.ts).
const YANDEX_PVZ_VALUE = "yandex-pvz";


// Что показываем покупателю при выборе самовывоза (и кладём в сводку заказа).
const PICKUP_INFO =
  "Санкт-Петербург, ст. м. Пионерская. Точный адрес и время выдачи согласую с вами по телефону после оформления.";

type DeliveryValue = (typeof DELIVERY_OPTIONS)[number]["value"];

// Минимальная валидация телефона: считаем цифры. Если 10 или 11 — ок.
// Ловить редкие форматы вроде "+44" не нужно — у нас только Россия.
function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

// Форматируем телефон в маску "+7 (XXX) XXX-XX-XX" по мере ввода.
// Из любой строки достаём только цифры, нормализуем "8..." → "7...",
// если человек начал не с 7 — подставляем 7 спереди (например, ввели
// "926..." → читаем как мобильный РФ). Лишнее (>11 цифр) отрезаем.
//
// Возвращаем форматированную строку. Закрывающие символы скобок и
// дефисов появляются ТОЛЬКО когда уже введена следующая цифра — иначе
// бэкспейс цеплялся бы за маску и удалить было бы тяжело.
function formatPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length > 0 && !digits.startsWith("7")) digits = "7" + digits;
  digits = digits.slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length === 1) return "+7";
  if (digits.length <= 4) return `+7 (${digits.slice(1)}`;
  if (digits.length <= 7) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`;
  }
  if (digits.length <= 9) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(
    7,
    9
  )}-${digits.slice(9, 11)}`;
}

// Простая проверка email — наличие @ и точки после неё. Полную RFC
// валидацию делать не нужно; реальную проверку сделает почтовик.
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Нормализуем Telegram-ник: убираем пробелы и ведущие @, оставляем
// только латиницу/цифры/подчёркивание (это то, что разрешает сам
// Telegram), и приклеиваем "@" обратно. Если после чистки ничего
// не осталось — возвращаем пустую строку: считаем, что человек
// ничего не указал.
function normalizeTelegram(input: string): string {
  const cleaned = input
    .trim()
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9_]/g, "");
  return cleaned ? `@${cleaned}` : "";
}

// deliveryFee — фикс-стоимость доставки в рублях, приходит с сервера
// (env DELIVERY_FLAT_FEE) через checkout/page.tsx. Показываем покупателю
// и включаем в итог к оплате. Настоящий пересчёт всё равно на сервере.
export function CheckoutClient({
  deliveryFee,
  mapsApiKey,
  yandexStationId,
}: {
  deliveryFee: number;
  mapsApiKey: string;
  yandexStationId: string;
}) {
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
  // Telegram-ник опционален. Храним как ввёл пользователь, нормализуем
  // только перед отправкой (приведём к виду @ник, выкинем мусор).
  const [telegram, setTelegram] = useState("");
  const [delivery, setDelivery] = useState<DeliveryValue>("cdek-pvz");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [agree, setAgree] = useState(false);
  // Honeypot: скрытое поле "website". Реальные пользователи его не видят
  // и не трогают, а спам-боты, которые тупо заполняют все input — заполняют.
  // На сервере непустое значение → запрос молча отвергается.
  const [website, setWebsite] = useState("");

  // ── Выбранный пункт выдачи (общее для СДЭК/Яндекс) ──────────────────────
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedPointAddress, setSelectedPointAddress] = useState("");
  const [pvzPrice, setPvzPrice] = useState<number | null>(null);
  // Отдельные флаг инициализации и последняя цена для виджета Яндекса.
  const yandexWidgetInitedRef = useRef(false);
  const lastYandexPriceRef = useRef<number | null>(null);

  const isPickup = delivery === PICKUP_VALUE;
  const isCdekPvz = delivery === CDEK_PVZ_VALUE;
  const isYandexPvz = delivery === YANDEX_PVZ_VALUE;
  // Оба виджетных способа (СДЭК/Яндекс) — «ПВЗ с онлайн-расчётом».
  const isAnyPvz = isCdekPvz || isYandexPvz;

  // Онлайн-расчёт недоступен только у Яндекса, если не задан id склада.
  // У СДЭК расчёт идёт через собственный API (компонент CdekPointPicker).
  const pvzUnavailable = isYandexPvz && !yandexStationId;

  // Вес посылки для виджета (граммы) — по категориям товаров в заказе.
  const parcelWeightGrams = useMemo(
    () =>
      getOrderWeightGrams(
        orderRows.map(({ product, quantity }) => ({
          productId: product.id,
          quantity,
        }))
      ),
    [orderRows]
  );

  // Стоимость доставки к показу/итогу:
  //  • самовывоз — 0;
  //  • СДЭК ПВЗ — цена от виджета (пока пункт не выбран — null; если
  //    расчёт недоступен — фикс из env как запасной вариант);
  //  • остальные способы — фикс из env.
  let effectiveDeliveryFee: number | null;
  if (isPickup) effectiveDeliveryFee = 0;
  else if (isAnyPvz) effectiveDeliveryFee = pvzUnavailable ? deliveryFee : pvzPrice;
  else effectiveDeliveryFee = deliveryFee;

  const grandTotal = totalPrice + (effectiveDeliveryFee ?? 0);

  // Готовность к оформлению: для СДЭК ПВЗ нужна известная цена (или
  // включённый запасной вариант, когда расчёт недоступен).
  const pvzReady = !isAnyPvz || pvzUnavailable || pvzPrice !== null;

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

  // ── Память формы ──────────────────────────────────────────────────────────
  // Восстанавливаем ранее введённые данные при возврате на чекаут. Читаем
  // localStorage один раз при маунте — поля не слетают, если человек ушёл в
  // каталог и вернулся. Согласие (agree) намеренно НЕ восстанавливаем: его
  // лучше подтверждать заново при каждом оформлении.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FORM_STORAGE_KEY);
      if (!stored) return;
      const d = JSON.parse(stored) as Partial<{
        name: string;
        phone: string;
        email: string;
        telegram: string;
        delivery: DeliveryValue;
        address: string;
        comment: string;
      }>;
      // setState внутри эффекта здесь оправдан: это одноразовое
      // восстановление данных из localStorage при маунте (localStorage
      // недоступен на сервере, поэтому нельзя сделать это в initial state).
      // Тот же приём используется для корзины в CartContext.
      /* eslint-disable react-hooks/set-state-in-effect */
      if (d.name) setName(d.name);
      if (d.phone) setPhone(d.phone);
      if (d.email) setEmail(d.email);
      // В state ник без "@" (слева фиксированная "@"), поэтому чистим.
      if (d.telegram) setTelegram(d.telegram.replace(/^@+/, ""));
      // Проверяем, что сохранённый способ доставки всё ещё существует —
      // на случай, если список DELIVERY_OPTIONS в будущем изменится.
      if (d.delivery && DELIVERY_OPTIONS.some((o) => o.value === d.delivery)) {
        setDelivery(d.delivery);
      }
      if (d.address) setAddress(d.address);
      if (d.comment) setComment(d.comment);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // Повреждённые данные — просто начинаем с пустой формы.
    }
  }, []);

  // Сохраняем черновик формы при каждом изменении полей. Данные лежат на
  // устройстве покупателя; после успешного заказа мы их стираем (см. submit).
  useEffect(() => {
    const draft = { name, phone, email, telegram, delivery, address, comment };
    try {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // localStorage может быть недоступен (приватный режим) — не критично.
    }
  }, [name, phone, email, telegram, delivery, address, comment]);

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
    if (!isPickup && !isAnyPvz && address.trim().length < 5) {
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

  // При смене способа доставки сбрасываем выбранный пункт и цену, чтобы
  // данные одного виджета (СДЭК/Яндекс) не перетекали в другой.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedPointId(null);
    setSelectedPointAddress("");
    setPvzPrice(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [delivery]);

  // Инициализация виджета ПВЗ Яндекс Доставки, когда выбран этот способ.
  // Виджет сам рисует карту с пунктами, ищет по адресу и считает стоимость.
  // Нужен только id склада отгрузки (source_platform_station) — токен не нужен.
  useEffect(() => {
    if (!isYandexPvz) {
      yandexWidgetInitedRef.current = false;
      return;
    }
    // Нет id склада отгрузки — виджет не поднимаем (покажем запасной вариант).
    if (!yandexStationId) return;

    const SCRIPT_SRC = "https://ndd-widget.landpro.site/widget.js?v=2";

    function createWidget() {
      const w = window as unknown as {
        YaDelivery?: { createWidget: (cfg: unknown) => void };
      };
      if (!w.YaDelivery || yandexWidgetInitedRef.current) return;
      const container = document.getElementById("delivery-widget");
      if (!container) return;
      container.innerHTML = ""; // на случай повторной инициализации
      yandexWidgetInitedRef.current = true;
      w.YaDelivery.createWidget({
        containerId: "delivery-widget",
        params: {
          city: "Санкт-Петербург",
          size: { height: "520px", width: "100%" },
          source_platform_station: yandexStationId,
          physical_dims_weight_gross: parcelWeightGrams,
          // Виджет зовёт эту функцию, чтобы показать цену пункта — запоминаем.
          delivery_price: (price: number) => {
            lastYandexPriceRef.current = price;
            return `${price} ₽`;
          },
          delivery_term: 2,
          show_select_button: true,
          filter: {
            type: ["pickup_point", "terminal"],
            payment_methods: ["already_paid"],
            payment_methods_filter: "or",
          },
        },
      });
    }

    function onPointSelected(e: Event) {
      const detail = (e as CustomEvent).detail as {
        id?: string;
        address?: { full_address?: string };
      };
      if (!detail?.id) return;
      setSelectedPointId(detail.id);
      setSelectedPointAddress(detail.address?.full_address ?? "");
      const price = lastYandexPriceRef.current;
      setPvzPrice(typeof price === "number" ? Math.ceil(price) : null);
    }

    const w = window as unknown as { YaDelivery?: unknown };
    if (w.YaDelivery) {
      createWidget();
    } else {
      if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
        const s = document.createElement("script");
        s.async = true;
        s.src = SCRIPT_SRC;
        document.body.appendChild(s);
      }
      document.addEventListener("YaNddWidgetLoad", createWidget);
    }
    document.addEventListener("YaNddWidgetPointSelected", onPointSelected);

    return () => {
      document.removeEventListener("YaNddWidgetLoad", createWidget);
      document.removeEventListener("YaNddWidgetPointSelected", onPointSelected);
      yandexWidgetInitedRef.current = false;
    };
  }, [isYandexPvz, yandexStationId, parcelWeightGrams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) {
      // Кнопка «Перейти к оплате» может быть активна, а ошибочные поля —
      // выше и за экраном. Показываем общее сообщение у кнопки и
      // подкручиваем к первому полю с ошибкой, чтобы человек его увидел.
      setSubmitError(
        "Заполнены не все обязательные поля — проверьте поля, отмеченные красным выше."
      );
      if (typeof document !== "undefined") {
        // Небольшая задержка: даём React отрисовать сообщения об ошибках,
        // прежде чем искать первое из них в DOM.
        setTimeout(() => {
          const firstError = document.querySelector("[data-field-error]");
          firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
      }
      return;
    }
    // Для СДЭК/Яндекс ПВЗ нельзя оформлять без рассчитанной стоимости.
    if (isAnyPvz && !pvzUnavailable && (!selectedPointId || pvzPrice === null)) {
      setSubmitError("Выберите пункт выдачи и дождитесь расчёта стоимости доставки.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const deliveryLabel =
      DELIVERY_OPTIONS.find((o) => o.value === delivery)?.label ?? delivery;

    // Тело запроса. Номер заказа сервер сгенерирует сам и вернёт нам
    // в ответе — поэтому здесь его нет.
    const normalizedTelegram = normalizeTelegram(telegram);
    const requestBody = {
      // Honeypot: имитирует обычное поле формы. Сервер увидит непустое
      // значение → молча "удачно" ответит без сохранения. Боты подумают,
      // что заказ принят, и не будут долбить повторно.
      website,
      contact: {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        // Только если человек реально что-то вписал — иначе null,
        // чтобы серверный валидатор не споткнулся об пустую строку.
        telegram: normalizedTelegram || null,
      },
      delivery: {
        method: delivery,
        methodLabel: deliveryLabel,
        // Адрес: для самовывоза — инфо о пункте; для СДЭК ПВЗ — выбранный
        // пункт (или введённый город, если онлайн-расчёт недоступен); иначе
        // — введённый адрес.
        address: isPickup
          ? PICKUP_INFO
          : isAnyPvz
            ? selectedPointAddress || "Выбранный пункт выдачи"
            : address.trim(),
        // id выбранного пункта выдачи (СДЭК/Яндекс) — для справки в заказе.
        pointId: isAnyPvz ? selectedPointId : null,
        // Стоимость доставки, посчитанная виджетом (СДЭК/Яндекс). Сервер
        // её санитизирует и использует как стоимость доставки.
        deliveryPrice: isAnyPvz && !pvzUnavailable ? pvzPrice : null,
      },
      comment: comment.trim() || null,
      items: orderRows.map(({ product, quantity }) => ({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
        sum: product.price * quantity,
      })),
      // Итог сервер посчитает сам (товары + фикс доставки), клиентскому
      // значению не доверяет. Шлём справочно, чтобы был в теле запроса.
      total: grandTotal,
    };

    try {
      // Создаём платёж в ЮKassa. В ответе — ссылка на оплату
      // (confirmationUrl), куда мы перенаправим покупателя.
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        orderId?: string;
        paymentId?: string;
        confirmationUrl?: string;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.orderId || !data.confirmationUrl) {
        setSubmitError(
          data.error ??
            "Не удалось перейти к оплате. Попробуйте ещё раз через минуту или напишите мне напрямую."
        );
        setSubmitting(false);
        return;
      }

      // Сохраняем копию заказа в sessionStorage, чтобы страница успеха
      // (куда ЮKassa вернёт после оплаты) показала сводку. sessionStorage
      // переживает переход на ЮKassa и обратно, пока вкладка открыта.
      const orderForSuccess = {
        ...requestBody,
        orderId: data.orderId,
        // paymentId нужен странице успеха, чтобы проверить реальный статус
        // оплаты у ЮKassa (покупатель мог вернуться, не заплатив).
        paymentId: data.paymentId ?? null,
        deliveryFee: effectiveDeliveryFee,
        createdAt: new Date().toISOString(),
      };
      try {
        sessionStorage.setItem(
          "stamps-shop-last-order",
          JSON.stringify(orderForSuccess)
        );
      } catch {
        // sessionStorage недоступен — success-страница покажет заглушку.
      }

      // Черновик формы НЕ стираем здесь: оплата ещё не прошла. Если
      // покупатель вернётся с ЮKassa не оплатив — форма останется заполненной.
      // Черновик и корзину чистит страница успеха.

      // Уходим на страницу оплаты ЮKassa (внешний переход — не router.push).
      window.location.href = data.confirmationUrl;
    } catch (err) {
      // Сетевая ошибка (нет интернета, CORS, и т.п.).
      console.error("payment create failed", err);
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
        {/* ── Honeypot ────────────────────────────────────────────────
            Скрытое поле "website". Визуально вынесено за экран, выключено
            из табуляции и автозаполнения — у настоящего пользователя
            оно всегда останется пустым. А обычные боты заполняют все
            <input> подряд, и сервер их по этому полю и поймает. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-9999px",
            top: "auto",
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
        >
          <label>
            Сайт (не заполнять)
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

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
              placeholder="Например, Вася Пупкин"
            />
          </Field>

          <Field
            label="Телефон"
            error={errors.phone}
            required
          >
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
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

          <Field
            label="Telegram"
            hint="Необязательно. Если укажете — напишу вам в Telegram, не нужно будет ждать звонка."
          >
            {/* Фиксированная "@" слева, чтобы её не нужно было вводить и
                нельзя было случайно стереть. В state храним ник без "@" —
                нормализуем и добавляем "@" уже при отправке. */}
            <div className="flex w-full items-center rounded-xl border border-zinc-300 transition focus-within:border-zinc-900">
              <span className="select-none pl-4 text-zinc-500">@</span>
              <input
                type="text"
                autoComplete="off"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value.replace(/^@+/, ""))}
                className="w-full rounded-xl bg-transparent py-3 pl-1 pr-4 outline-none"
                placeholder="username"
              />
            </div>
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
            {isAnyPvz && (
              <p className="text-xs text-zinc-500">
                Выберите населённый пункт, затем укажите подходящий ПВЗ —
                стоимость доставки посчитается автоматически и войдёт в итог.
              </p>
            )}
            {!isPickup && !isAnyPvz && (
              <p className="text-xs text-zinc-500">
                Стоимость доставки сообщу отдельно после оформления.
              </p>
            )}
          </div>

          {isPickup ? (
            // Самовывоз: адрес вводить не нужно — показываем адрес пункта.
            <div className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              <p className="mb-1 font-medium text-zinc-900">Пункт самовывоза</p>
              <p>{PICKUP_INFO}</p>
            </div>
          ) : isCdekPvz ? (
            // СДЭК ПВЗ: свой выбор пункта через API (без виджета) — город,
            // список ПВЗ/постаматов, цена считается на сервере. Отдельный фон,
            // чтобы блок доставки визуально выделялся.
            <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
              <CdekPointPicker
                orderSum={totalPrice}
                weightGrams={parcelWeightGrams}
                mapsApiKey={mapsApiKey}
                onSelect={(sel) => {
                  if (sel) {
                    setSelectedPointId(sel.pointId);
                    setSelectedPointAddress(sel.address);
                    setPvzPrice(sel.price);
                  } else {
                    setSelectedPointId(null);
                    setSelectedPointAddress("");
                    setPvzPrice(null);
                  }
                }}
              />
              {selectedPointId && pvzPrice !== null && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm">
                  <p className="font-medium text-zinc-900">Пункт выбран</p>
                  {selectedPointAddress && (
                    <p className="text-zinc-600">{selectedPointAddress}</p>
                  )}
                  <p className="mt-1 font-medium">
                    Стоимость доставки: {pvzPrice.toLocaleString("ru-RU")} ₽
                  </p>
                </div>
              )}
            </div>
          ) : isYandexPvz ? (
            // Яндекс ПВЗ: официальный виджет Яндекс Доставки — карта с пунктами,
            // поиск по адресу и расчёт стоимости внутри виджета.
            <div className="flex flex-col gap-3">
              {pvzUnavailable ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Онлайн-расчёт временно недоступен — стоимость доставки сообщу
                  отдельно после оформления.
                </p>
              ) : (
                <>
                  <div
                    id="delivery-widget"
                    style={{ width: "100%", minHeight: "520px" }}
                    className="overflow-hidden rounded-xl border border-zinc-200"
                  />
                  {selectedPointId && (
                    <div className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm">
                      <p className="font-medium text-zinc-900">Пункт выбран</p>
                      {selectedPointAddress && (
                        <p className="text-zinc-600">{selectedPointAddress}</p>
                      )}
                      {pvzPrice !== null && (
                        <p className="mt-1 font-medium">
                          Стоимость доставки: {pvzPrice.toLocaleString("ru-RU")} ₽
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
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
          )}

          <Field
            label="Комментарий"
            hint="Удобный способ связи (Telegram, звонок), пожелания по упаковке или деталям индивидуального заказа."
          >
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[80px] w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
              placeholder="Например: лучше написать в Telegram; упаковать как подарок"
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
          <div className="flex flex-col gap-1 px-4 pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Товары</span>
              <span className="font-medium">
                {totalPrice.toLocaleString("ru-RU")} ₽
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Доставка</span>
              <span className="font-medium">
                {isPickup
                  ? "бесплатно (самовывоз)"
                  : isAnyPvz
                    ? pvzUnavailable
                      ? "сообщу отдельно"
                      : pvzPrice !== null
                        ? `${pvzPrice.toLocaleString("ru-RU")} ₽`
                        : "выберите пункт"
                    : deliveryFee > 0
                      ? `${deliveryFee.toLocaleString("ru-RU")} ₽`
                      : "рассчитаю отдельно"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-2">
              <span className="text-zinc-500">Итого к оплате</span>
              <span className="text-2xl font-semibold">
                {grandTotal.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          </div>
          {errors.total && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {errors.total}
            </p>
          )}
          {!isPickup && (isAnyPvz ? pvzPrice !== null : deliveryFee > 0) && (
            <p className="px-4 text-xs text-zinc-500">
              Оплата товара и доставки проходит одним платежом.
            </p>
          )}
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
            <p data-field-error className="text-sm text-red-600 ml-7">
              {errors.agree}
            </p>
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
          disabled={submitting || !pvzReady}
          className="w-full rounded-2xl bg-zinc-900 px-6 py-4 text-base font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:self-start"
        >
          {submitting
            ? "Перехожу к оплате…"
            : `Перейти к оплате${grandTotal > 0 ? ` — ${grandTotal.toLocaleString("ru-RU")} ₽` : ""}`}
        </button>

        <p className="text-xs text-zinc-500">
          Оплата проходит на защищённой странице ЮKassa. После оплаты я получу
          заказ и свяжусь с вами, чтобы согласовать отправку.
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
      {error && (
        <span data-field-error className="text-sm text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}
