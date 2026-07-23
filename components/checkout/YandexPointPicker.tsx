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

// Стиль оператора/типа пункта: пресет метки на карте, цвет точки в списке,
// полная и короткая подписи. Так значки 5Post / Яндекс Маркета / постаматов
// визуально различаются и на карте, и в списке.
function operatorStyle(p: Point): {
  preset: string;
  color: string;
  label: string;
  short: string;
} {
  if (p.type === "terminal") {
    return {
      preset: "islands#blueDotIcon",
      color: "#2f6ff0",
      label: "Постамат",
      short: "Постамат",
    };
  }
  if (p.operatorId === "5post") {
    return {
      preset: "islands#greenDotIcon",
      color: "#2db34a",
      label: "5Post — касса в «Пятёрочке»/«Перекрёстке»",
      short: "5Post",
    };
  }
  if (p.operatorId === "market_l4g") {
    return {
      preset: "islands#yellowDotIcon",
      color: "#f2c200",
      label: "ПВЗ Яндекс Маркета",
      short: "Яндекс Маркет",
    };
  }
  return {
    preset: "islands#grayDotIcon",
    color: "#9ca3af",
    label: "Пункт выдачи",
    short: "ПВЗ",
  };
}

export function YandexPointPicker({
  orderSum,
  weightGrams,
  mapsApiKey,
  cityQuery,
  onCityQueryChange,
  onSelect,
}: {
  orderSum: number;
  weightGrams: number;
  // Ключ Яндекс.Карт для карты пунктов. Пусто — кнопка «на карте» не показывается.
  mapsApiKey: string;
  // Текст города — общий для служб доставки (приходит из чекаута).
  cityQuery: string;
  onCityQueryChange: (q: string) => void;
  onSelect: (
    sel: { pointId: string; address: string; price: number } | null
  ) => void;
}) {
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
  const [geoLocating, setGeoLocating] = useState(false);
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
    onCityQueryChange(g.address);
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

  // ── «Рядом со мной» → точная геолокация → ближайшие пункты ─────────────────
  function findNearMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Геолокация не поддерживается вашим браузером.");
      return;
    }
    setError(null);
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Синтетический «город» — чтобы отрисовался список пунктов.
        setGeo({ geoId: -1, address: "рядом с вами" });
        setSuggestions([]);
        setSelectedId(null);
        setPrice(null);
        setPriceError(null);
        setShowMap(false);
        setPoints([]);
        onSelect(null);
        setLoading(true);
        try {
          const r = await fetch(
            `/api/yandex/points?lat=${latitude}&lon=${longitude}`
          );
          const d = (await r.json()) as { points?: Point[] };
          const all = Array.isArray(d.points) ? d.points : [];
          setPoints(all);
          if (all.length === 0) {
            setError(
              "Рядом не нашлось пунктов выдачи — попробуйте ввести город."
            );
          }
        } catch {
          setError("Не удалось загрузить пункты. Попробуйте ещё раз.");
        } finally {
          setLoading(false);
          setGeoLocating(false);
        }
      },
      (err) => {
        setGeoLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            "Доступ к геолокации запрещён. Разрешите его в браузере или введите город вручную."
          );
        } else {
          setError(
            "Не удалось определить местоположение. Введите город вручную."
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
            controls: ["zoomControl"],
          },
          { suppressMapOpenBlock: true }
        );
        mapRef.current = map;
        // Отдельный кластер на каждый тип оператора — чтобы и в кластерах цвет
        // соответствовал 5Post / Яндекс Маркету / постаматам.
        const clusterPresetByKind: Record<string, string> = {
          terminal: "islands#invertedBlueClusterIcons",
          "5post": "islands#invertedGreenClusterIcons",
          market_l4g: "islands#invertedYellowClusterIcons",
          other: "islands#invertedGrayClusterIcons",
        };
        const kindOf = (p: Point): string =>
          p.type === "terminal"
            ? "terminal"
            : p.operatorId === "5post"
              ? "5post"
              : p.operatorId === "market_l4g"
                ? "market_l4g"
                : "other";

        const groups = new Map<string, Point[]>();
        for (const p of withCoords) {
          const k = kindOf(p);
          const arr = groups.get(k);
          if (arr) arr.push(p);
          else groups.set(k, [p]);
        }
        for (const [kind, groupPoints] of groups) {
          const clusterer = new ymaps.Clusterer({
            preset:
              clusterPresetByKind[kind] ?? "islands#invertedGrayClusterIcons",
            groupByCoordinates: false,
          });
          const placemarks = groupPoints.map((p) => {
            const st = operatorStyle(p);
            const pm = new ymaps.Placemark(
              [p.lat as number, p.lon as number],
              {
                balloonContentHeader: st.label,
                balloonContentBody: `${p.address}${p.comment ? `<br>${p.comment}` : ""}`,
                hintContent: p.address,
              },
              { preset: st.preset }
            );
            pm.events.add("click", () => choosePointRef.current(p));
            return pm;
          });
          clusterer.add(placemarks);
          map.geoObjects.add(clusterer);
        }

        // Границы карты по всем точкам.
        const lats = withCoords.map((p) => p.lat as number);
        const lons = withCoords.map((p) => p.lon as number);
        map.setBounds(
          [
            [Math.min(...lats), Math.min(...lons)],
            [Math.max(...lats), Math.max(...lons)],
          ],
          { checkZoomRange: true, zoomMargin: 30 }
        );
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

  // Легенда карты: уникальные операторы среди найденных точек.
  const legendItems = Array.from(
    new Map(
      points.map((p) => {
        const s = operatorStyle(p);
        return [s.short, { short: s.short, color: s.color }];
      })
    ).values()
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Город с автоподсказкой */}
      <div className="relative">
        <input
          type="text"
          value={cityQuery}
          onChange={(e) => {
            onCityQueryChange(e.target.value);
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

      {/* Поиск ближайших пунктов по точной геолокации браузера */}
      <button
        type="button"
        onClick={findNearMe}
        disabled={geoLocating}
        className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {geoLocating ? "Определяю местоположение…" : "Найти пункты рядом со мной"}
      </button>

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

      {/* Карта пунктов + легенда цветов операторов */}
      {showMap && points.length > 0 && (
        <>
          <div
            id={MAP_CONTAINER_ID}
            style={{ width: "100%", height: "440px" }}
            className="overflow-hidden rounded-xl border border-zinc-200"
          />
          {legendItems.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-zinc-600">
              {legendItems.map((l) => (
                <span key={l.short} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  {l.short}
                </span>
              ))}
            </div>
          )}
        </>
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
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: operatorStyle(p).color }}
                      />
                      {operatorStyle(p).label}
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
