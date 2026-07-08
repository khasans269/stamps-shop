"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Кликабельная картинка: показывает превью (заполняет родительский
// контейнер), а по клику открывает увеличенную версию поверх страницы.
// Родитель должен быть position: relative и задавать размер превью.
export function ZoomableImage({
  src,
  alt,
  sizes = "100vw",
  priority = false,
}: {
  src: string;
  alt: string;
  sizes?: string;
  // priority=true — грузить сразу (для картинок на первом экране, LCP).
  priority?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Пока увеличенное фото открыто: закрываем по Escape и блокируем
  // прокрутку фона, чтобы страница под оверлеем не «уезжала».
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Превью — заполняет контейнер родителя. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute inset-0 cursor-zoom-in"
        aria-label={`Открыть фото: ${alt}`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </button>

      {/* Оверлей с увеличенным фото. Клик по фону или ✕ — закрыть. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative h-[85vh] w-full max-w-4xl"
          >
            <Image
              src={src}
              alt={alt}
              fill
              sizes="90vw"
              className="object-contain"
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-2xl leading-none text-white hover:bg-white/20"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
