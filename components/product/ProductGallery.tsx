"use client";

import { useState } from "react";
import Image from "next/image";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

// Галерея фото на странице товара.
// Принимает массив путей к фото и название (для alt-атрибутов).
// Логика:
//  - Большое главное фото — то, что выбрано миниатюрой (по умолчанию первое).
//  - Под ним — горизонтальный ряд миниатюр (если фото больше одного).
//  - Клик по большому фото открывает лайтбокс с зумом и пролистыванием.
export function ProductGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  // Индекс активного фото (которое сейчас большое).
  const [activeIndex, setActiveIndex] = useState(0);
  // Открыт ли лайтбокс.
  const [isOpen, setIsOpen] = useState(false);

  // Если фото вообще нет — показываем placeholder.
  if (images.length === 0) {
    return (
      <div className="aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200">
        <div className="flex h-full w-full items-center justify-center text-zinc-400">
          Нет фото
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Главное фото. По клику открывается лайтбокс. */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Открыть фото на весь экран"
        className="relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200"
      >
        <Image
          src={images[activeIndex]}
          alt={name}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
      </button>

      {/* Миниатюры. Показываем только если фото больше одного. */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`Показать фото ${i + 1}`}
              className={`relative aspect-square h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 transition ${
                i === activeIndex
                  ? "ring-2 ring-zinc-900 ring-offset-2"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <Image
                src={src}
                alt={`${name} — фото ${i + 1}`}
                fill
                className="object-cover"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}

      {/* Лайтбокс — открывается при клике на главное фото.
          Откроется на том фото, которое сейчас активно. */}
      <Lightbox
        open={isOpen}
        close={() => setIsOpen(false)}
        index={activeIndex}
        on={{
          // Когда пользователь свайпает в лайтбоксе — синхронизируем активный
          // индекс с внешней галереей, чтобы после закрытия лайтбокса было
          // выбрано то же фото, на котором его закрыли.
          view: ({ index }) => setActiveIndex(index),
        }}
        slides={images.map((src) => ({ src }))}
        plugins={[Zoom]}
        // Настройки зума: на десктопе — колесом, на мобильном — двойным тапом
        // и щипком (это поведение по умолчанию у плагина Zoom).
        zoom={{
          maxZoomPixelRatio: 3,
          scrollToZoom: true,
        }}
      />
    </div>
  );
}
