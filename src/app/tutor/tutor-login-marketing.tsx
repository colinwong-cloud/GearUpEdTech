"use client";

import { useEffect, useState } from "react";
import { parseTutorPortalFaq, type TutorFaqSection } from "@/lib/tutor-portal-faq";

function tutorFaqUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return base
    ? `${base}/storage/v1/object/public/Webpage_images/tutor/tutor_portal_FAQ_261005.txt`
    : "";
}

const TUTOR_CAROUSEL_IMAGES = [1, 2, 3, 4, 5, 6, 7].map(
  (index) => `/tutor/20261005-tutor-${index}.webp`
);

const INTRO =
  "增分寶 GearUp Quiz 導師平台專為香港私人補習導師而設，幫你輕鬆跟進學生中、英、數練習表現。你可查看學生進度、弱項、錯題解釋及同級比較，並快速生成30題離線練習卷，令備課更有效率，向家長交代更有說服力。";

export function TutorLoginCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = TUTOR_CAROUSEL_IMAGES.length;

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
      aria-label="導師平台介紹"
      className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative aspect-square bg-sky-50">
        {TUTOR_CAROUSEL_IMAGES.map((src, imageIndex) => {
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
              alt={`導師平台介紹 ${imageIndex + 1}`}
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
        {TUTOR_CAROUSEL_IMAGES.map((src, imageIndex) => (
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

export function TutorPortalIntro() {
  return (
    <section className="rounded-2xl border border-amber-100 bg-gradient-to-b from-amber-50 via-white to-sky-50 p-5 shadow-sm">
      <div className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
        平台簡介
      </div>
      <p className="mt-3 text-sm leading-7 text-gray-700">{INTRO}</p>
      <p className="mt-3 rounded-2xl border border-emerald-100 bg-white/80 px-3 py-2 text-sm leading-7 text-gray-700">
        <span className="font-semibold text-gray-900">創新理念獲肯定：</span>
        憑藉我們對教育科技創新的追求，以及持續專注優化學習平台的努力，GearUp Quiz
        已成功申請並通過香港科技園（HKSTP）一系列評審，於2026年10月正式獲批成為 HKSTP 合作夥伴。
      </p>
    </section>
  );
}

export function TutorPortalFaq() {
  const faqUrl = tutorFaqUrl();
  const [sections, setSections] = useState<TutorFaqSection[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const shownError = faqUrl ? error : "未能載入常見問題，請稍後再試。";

  useEffect(() => {
    if (!faqUrl) return;
    let cancelled = false;
    void fetch(faqUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("faq");
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        setSections(parseTutorPortalFaq(text));
      })
      .catch(() => {
        if (!cancelled) setError("未能載入常見問題，請稍後再試。");
      });
    return () => {
      cancelled = true;
    };
  }, [faqUrl]);

  return (
    <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
      <div className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-900">
        常見問題
      </div>
      {shownError && <p className="mt-3 text-sm text-rose-600">{shownError}</p>}
      <div className="mt-4 space-y-5">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-sm font-bold text-gray-800">{section.title}</h2>
            <div className="mt-2 space-y-2">
              {section.items.map((item) => {
                const key = `${section.title}-${item.question}`;
                const open = openKey === key;
                return (
                  <div key={key} className="rounded-xl border border-sky-100 bg-sky-50/40">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? null : key)}
                      className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-gray-800"
                    >
                      <span>{item.question}</span>
                      <span aria-hidden className="text-indigo-500">{open ? "−" : "+"}</span>
                    </button>
                    {open && (
                      <p className="px-3 pb-3 text-sm leading-7 text-gray-600 whitespace-pre-line">
                        {item.answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
