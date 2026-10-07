"use client";

import { useEffect, useState } from "react";

const MAIN_PAGE_BANNERS = [0, 1, 3, 4, 5, 6].map(
  (index) => `/main/main-page-banner-${index}.webp`
);

export function MainPagePartnerLogos() {
  return (
    <div className="mb-4 flex items-center justify-between gap-6 rounded-2xl bg-white px-3 py-3 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/main/gearup-quiz-logo.webp"
        alt="GearUp Quiz"
        className="h-16 w-auto max-w-[48%] object-contain object-left"
        draggable={false}
      />
      {/* Official aquamarine HKSTP Partner lockup. Do not recolor or stretch. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/main/hkstp-partner-aquamarine.png"
        alt="HKSTP Partner"
        className="h-12 w-auto max-w-[48%] object-contain object-right"
        draggable={false}
      />
    </div>
  );
}

export function MainPageBannerCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = MAIN_PAGE_BANNERS.length;

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  const show = (next: number) => {
    setIndex((next + count) % count);
  };

  return (
    <section
      aria-label="增分寶介紹"
      className="mb-4 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative bg-sky-50" style={{ aspectRatio: "1374 / 1145" }}>
        {MAIN_PAGE_BANNERS.map((src, imageIndex) => {
          const nearby = Math.min(
            Math.abs(imageIndex - index),
            count - Math.abs(imageIndex - index)
          );
          if (nearby > 1) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={`增分寶介紹 ${imageIndex + 1}`}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                imageIndex === index ? "opacity-100" : "opacity-0"
              }`}
              draggable={false}
            />
          );
        })}
        <button
          type="button"
          aria-label="上一張"
          onClick={() => show(index - 1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-semibold text-indigo-700 shadow"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="下一張"
          onClick={() => show(index + 1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-semibold text-indigo-700 shadow"
        >
          ›
        </button>
      </div>
      <div className="flex justify-center gap-2 py-3">
        {MAIN_PAGE_BANNERS.map((src, imageIndex) => (
          <button
            key={src}
            type="button"
            aria-label={`第 ${imageIndex + 1} 張`}
            onClick={() => show(imageIndex)}
            className={`h-2.5 w-2.5 rounded-full ${
              imageIndex === index ? "bg-indigo-600" : "bg-indigo-200"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
