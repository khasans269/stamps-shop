"use client";

import { useEffect, useRef, useState } from "react";

// Кастомный выбор пункта выдачи СДЭК (без виджета): город с автоподсказкой →
// список ПВЗ/постаматов города → выбор пункта. Опционально — карта с пинами
// (Яндекс.Карты + кластеризация). Цену считает сервер (/api/cdek/price).

type City = { cityCode: number; name: string; region: string };
type Point = {
  code: string;
  name: string;
  address: string;
  workTime: string;
  type: "PVZ" | "POSTAMAT";
  lat: number | null;
  lon: number | null;
};
type Prices = { pvz: number | null; postamat: number | null };

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

const MAP_CONTAINER_ID = "cdek-points-map";

export function CdekPointPicker({
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
  const [suggestions, setSuggestions] = useState<City[]>([]);
  const [city, setCity] = useState<City | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [prices, setPrices] = useState<Prices>({ pvz: null, postamat: null });
  const [pointSearch, setPointSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
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
    // Убираем префикс «г.»/«город» (браузер часто автоподставляет
    // «г. Санкт-Петербург» — СДЭК по такой строке ничего не находит).
    const q = cityQuery
      .trim()
      .replace(/^(г\.?|город)\s+/i, "")
      .trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/cdek/cities?q=${encodeURIComponent(q)}`);
        const d = (await r.json()) as { cities?: City[] };
        setSuggestions(Array.isArray(d.cities) ? d.cities : []);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [cityQuery]);

  // ── Выбор города → грузим пункты и цену ────────────────────────────────────
  async function chooseCity(c: City) {
    suppressSuggest.current = true;
    setCity(c);
    setCityQuery(c.region ? `${c.name}, ${c.region}` : c.name);
    setSuggestions([]);
    setPoints([]);
    setPrices({ pvz: null, postamat: null });
    setSelectedCode(null);
    setPointSearch("");
    setShowMap(false);
    setError(null);
    onSelect(null);
    setLoading(true);
    try {
      const [pointsRes, priceRes] = await Promise.all([
        fetch(`/api/cdek/points?city_code=${c.cityCode}`).then((r) => r.json()),
        fetch(`/api/cdek/price`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cityCode: c.cityCode, weightGrams, orderSum }),
        }).then((r) => r.json()),
      ]);
      const pr: Prices = {
        pvz: typeof priceRes?.pvz === "number" ? priceRes.pvz : null,
        postamat:
          typeof priceRes?.postamat === "number" ? priceRes.postamat : null,
      };
      setPrices(pr);
      const all: Point[] = Array.isArray(pointsRes?.points)
        ? pointsRes.points
        : [];
      const usable = all.filter((p) =>
        p.type === "POSTAMAT" ? pr.postamat != null : pr.pvz != null
      );
      setPoints(usable);
      if (usable.length === 0) {
        setError("В этом городе нет доступных пунктов выдачи для расчёта.");
      }
    } catch {
      setError("Не удалось загрузить пункты. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  function priceForType(type: "PVZ" | "POSTAMAT"): number | null {
    return type === "POSTAMAT" ? prices.postamat : prices.pvz;
  }

  function choosePoint(p: Point) {
    const price = priceForType(p.type);
    if (price == null) return;
    setSelectedCode(p.code);
    onSelect({ pointId: p.code, address: p.address || p.name, price });
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
              balloonContentHeader:
                p.type === "POSTAMAT" ? "Постамат" : "Пункт выдачи",
              balloonContentBody: `${p.address}<br>${p.workTime}`,
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
    ? points.filter((p) => p.address.toLowerCase().includes(search))
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
            setCity(null);
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
            {suggestions.map((c) => (
              <li key={`${c.cityCode}`}>
                <button
                  type="button"
                  onClick={() => chooseCity(c)}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-zinc-50"
                >
                  <span className="font-medium text-zinc-900">{c.name}</span>
                  {c.region && (
                    <span className="text-zinc-500"> · {c.region}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading && (
        <p className="text-sm text-zinc-500">Загружаю пункты и стоимость…</p>
      )}

      {error && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      )}

      {city && points.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-700">
            Пункты выдачи в городе {city.name}:
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
              const price = priceForType(p.type);
              const active = selectedCode === p.code;
              return (
                <li key={p.code}>
                  <button
                    type="button"
                    onClick={() => choosePoint(p)}
                    className={`block w-full px-4 py-3 text-left transition ${
                      active ? "bg-green-50" : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">
                          {p.address || p.name}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {p.type === "POSTAMAT" ? "Постамат" : "Пункт выдачи"}
                          {p.workTime ? ` · ${p.workTime}` : ""}
                        </p>
                      </div>
                      {price != null && (
                        <span className="shrink-0 text-sm font-semibold">
                          {price.toLocaleString("ru-RU")} ₽
                        </span>
                      )}
                    </div>
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
