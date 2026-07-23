"use client";

import { useEffect, useRef, useState } from "react";

// Кастомный выбор пункта выдачи Яндекс Доставки (без виджета): город с
// автоподсказкой → список ПВЗ/постаматов города со ВСЕМИ операторами
// (5post + ПВЗ Яндекса + постаматы) → выбор пункта → серверный расчёт цены.
// Виджет Яндекса показывает только ПВЗ Яндекс Маркета, поэтому используем API.

type Geo = { geoId: number; address: string };
type Point = {
  id: string;
  operatorId: string;
  name: string;
  type: "pickup_point" | "terminal";
  address: string;
  comment: string;
  lat: number | null;
  lon: number | null;
};

// Минимальный тип Яндекс.Карт 2.1 (только то, что используем).
type YMapInstance = {
  geoObjects: { add: (o: unknown) => void };
  setBounds: (b: unknown, opts?: object) => void;
  destroy: () => void;
};
type YMaps = {
  ready: (cb: () => void) => void;
  Map: new (el: HTMLElement | string, state: object, opts?: object) => YMapInstance;
  Clusterer: new (opts?: object) => {
    add: (p: unknown) => void;
    getBounds: () => unknown;
  };
  Placemark: new (
    coords: number[],
    props?: object,
    opts?: object
  ) => { events: { add: (ev: string, cb: () => void) => void } };
};

const MAP_CONTAINER_ID = "yandex-points-map";

// Понятная подпись оператора/типа пункта.
function operatorLabel(p: Point): string {
  if (p.type === "terminal") return "Постамат";
  if (p.operatorId === "5post") return "5Post — касса в «Пятёрочке»/«Перекрёстке»";
  if (p.operatorId === "market_l4g") return "ПВЗ Яндекс Маркета";
  return "Пункт выдачи";
}

export function YandexPointPicker({
  orderSum,
  weightGrams,
  mapsApiKey,
  onSelect,
}: {
  orderSum: number;
  weightGrams: number;
  // Ключ Яндекс.Карт для карты пунктов. Пусто — кнопка «на карте» не показывается.
  mapsApiKey: string;
  onSelect: (
    sel: { pointId: string; address: string; price: number } | null
  ) => void;
}) {
  const [cityQuery, setCityQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Geo[]>([]);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [pointSearch, setPointSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const suppressSuggest = useRef(false);

  // ── Автоподсказка городов (дебаунс 300 мс) ─────────────────────────────────
  useEffect(() => {
    if (suppressSuggest.current) {
      suppressSuggest.current = false;
      return;
    }
    const q = cityQuery.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/yandex/cities?q=${encodeURIComponent(q)}`);
        const d = (await r.json()) as { cities?: Geo[] };
        setSuggestions(Array.isArray(d.cities) ? d.cities : []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [cityQuery]);

  // ── Выбор города → грузим пункты ───────────────────────────────────────────
  async function chooseCity(g: Geo) {
    suppressSuggest.current = true;
    setGeo(g);
    setCityQuery(g.address);
    setSuggestions([]);
    setPoints([]);
    setSelectedId(null);
    setPrice(null);
    setPriceError(null);
    setPointSearch("");
    setShowMap(false);
    setError(null);
    onSelect(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/yandex/points?geoId=${g.geoId}`);
      const d = (await r.json()) as { points?: Point[] };
      const all = Array.isArray(d.points) ? d.points : [];
      setPoints(all);
      if (all.length === 0) {
        setError("В этом населённом пункте нет доступных пунктов выдачи.");
      }
    } catch {
      setError("Не удалось загрузить пункты. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  // ── Выбор пункта → серверный расчёт цены ───────────────────────────────────
  async function choosePoint(p: Point) {
    setSelectedId(p.id);
    setPrice(null);
    setPriceError(null);
    setPriceLoading(true);
    onSelect(null); // до расчёта цена неизвестна — оформлять нельзя
    try {
      const r = await fetch(`/api/yandex/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pointId: p.id, weightGrams, orderSum }),
      });
      const d = (await r.json()) as { price?: number | null };
      if (r.ok && typeof d.price === "number") {
        setPrice(d.price);
        onSelect({ pointId: p.id, address: p.address || p.name, price: d.price });
      } else {
        setPriceError(
          "Не удалось рассчитать стоимость для этого пункта. Выберите другой."
        );
      }
    } catch {
      setPriceError("Не удалось рассчитать стоимость. Попробуйте ещё раз.");
    } finally {
      setPriceLoading(false);
    }
  }

  // Свежий choosePoint для обработчиков карты (без пересоздания карты).
  const choosePointRef = useRef(choosePoint);
  useEffect(() => {
    choosePointRef.current = choosePoint;
  });

  // ── Карта пунктов (Яндекс.Карты 2.1 + кластеризация) ───────────────────────
  const mapRef = useRef<YMapInstance | null>(null);
  useEffect(() => {
    if (!showMap || !mapsApiKey || points.length === 0) return;
    const SCRIPT_SRC = `https://api-maps.yandex.ru/2.1/?apikey=${mapsApiKey}&lang=ru_RU`;
    let destroyed = false;

    function initMap() {
      const ymaps = (window as unknown as { ymaps?: YMaps }).ymaps;
      if (!ymaps || destroyed) return;
      ymaps.ready(() => {
        if (destroyed) return;
        const container = document.getElementById(MAP_CONTAINER_ID);
        if (!container) return;
        const withCoords = points.filter((p) => p.lat != null && p.lon != null);
        if (withCoords.length === 0) return;
        const map = new ymaps.Map(
          container,
          {
            center: [withCoords[0].lat as number, withCoords[0].lon as number],
            zoom: 11,
            controls: ["zoomControl", "geolocationControl"],
          },
          { suppressMapOpenBlock: true }
        );
        mapRef.current = map;
        const clusterer = new ymaps.Clusterer({
          preset: "islands#invertedBlueClusterIcons",
          groupByCoordinates: false,
        });
        const placemarks = withCoords.map((p) => {
          const pm = new ymaps.Placemark(
            [p.lat as number, p.lon as number],
            {
              balloonContentHeader: operatorLabel(p),
              balloonContentBody: `${p.address}${p.comment ? `<br>${p.comment}` : ""}`,
              hintContent: p.address,
            },
            { preset: "islands#blueDotIcon" }
          );
          pm.events.add("click", () => choosePointRef.current(p));
          return pm;
        });
        clusterer.add(placemarks);
        map.geoObjects.add(clusterer);
        map.setBounds(clusterer.getBounds(), {
          checkZoomRange: true,
          zoomMargin: 30,
        });
      });
    }

    if ((window as unknown as { ymaps?: YMaps }).ymaps) {
      initMap();
    } else {
      let s = document.querySelector<HTMLScriptElement>(
        `script[src="${SCRIPT_SRC}"]`
      );
      if (!s) {
        s = document.createElement("script");
        s.src = SCRIPT_SRC;
        document.body.appendChild(s);
      }
      s.addEventListener("load", initMap);
    }

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [showMap, points, mapsApiKey]);

  const search = pointSearch.trim().toLowerCase();
  const filtered = search
    ? points.filter(
        (p) =>
          p.address.toLowerCase().includes(search) ||
          p.name.toLowerCase().includes(search)
      )
    : points;

  return (
    <div className="flex flex-col gap-3">
      {/* Город с автоподсказкой */}
      <div className="relative">
        <input
          type="text"
          value={cityQuery}
          onChange={(e) => {
            setCityQuery(e.target.value);
            setGeo(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions.length > 0) {
              e.preventDefault();
              chooseCity(suggestions[0]);
            }
          }}
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none transition focus:border-zinc-900"
          placeholder="Город доставки — начните вводить"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
            {suggestions.map((g) => (
              <li key={`${g.geoId}`}>
                <button
                  type="button"
                  onClick={() => chooseCity(g)}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-zinc-50"
                >
                  <span className="text-zinc-900">{g.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading && <p className="text-sm text-zinc-500">Загружаю пункты…</p>}

      {error && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      )}

      {geo && points.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-700">
            Пунктов найдено: {points.length}
          </p>
          {mapsApiKey && (
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1 text-sm text-zinc-700 transition hover:bg-zinc-50"
            >
              {showMap ? "Показать списком" : "Показать на карте"}
            </button>
          )}
        </div>
      )}

      {/* Карта пунктов */}
      {showMap && points.length > 0 && (
        <div
          id={MAP_CONTAINER_ID}
          style={{ width: "100%", height: "440px" }}
          className="overflow-hidden rounded-xl border border-zinc-200"
        />
      )}

      {/* Список пунктов (когда карта скрыта) */}
      {!showMap && points.length > 0 && (
        <>
          <input
            type="text"
            value={pointSearch}
            onChange={(e) => setPointSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-4 py-2 text-sm outline-none transition focus:border-zinc-900"
            placeholder="Поиск по адресу пункта"
            autoComplete="off"
          />
          <ul className="max-h-96 divide-y divide-zinc-100 overflow-auto rounded-xl border border-zinc-200">
            {filtered.map((p) => {
              const active = selectedId === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choosePoint(p)}
                    className={`block w-full px-4 py-3 text-left transition ${
                      active ? "bg-green-50" : "hover:bg-zinc-50"
                    }`}
                  >
                    <p className="text-sm font-medium text-zinc-900">
                      {p.address || p.name}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {operatorLabel(p)}
                    </p>
                    {active && priceLoading && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Считаю стоимость…
                      </p>
                    )}
                    {active && price != null && !priceLoading && (
                      <p className="mt-1 text-sm font-semibold">
                        Доставка: {price.toLocaleString("ru-RU")} ₽
                      </p>
                    )}
                    {active && priceError && !priceLoading && (
                      <p className="mt-1 text-xs text-red-700">{priceError}</p>
                    )}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-zinc-500">
                По запросу ничего не найдено.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
