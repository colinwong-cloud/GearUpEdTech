"use client";

import { useState } from "react";
import { buildTutorShareUrl, buildTutorWhatsAppText } from "@/lib/tutor-share-link";

const WHATSAPP_ICON_PATH = "/social/whatsapp.svg";

async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    if (typeof document === "undefined") return false;
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    return copied;
  } catch {
    return false;
  }
}

export function TutorShareLink({ code }: { code: string }) {
  const [notice, setNotice] = useState<string | null>(null);
  const shareUrl = buildTutorShareUrl(code);

  const handleCopy = async () => {
    const copied = await copyTextToClipboard(shareUrl);
    setNotice(copied ? "已複製連結" : "未能複製，請長按連結複製");
  };

  const handleWhatsApp = () => {
    const text = buildTutorWhatsAppText(code);
    const encoded = encodeURIComponent(text);
    const isMobile = /Android|iPhone|iPad|iPod/i.test(
      typeof navigator !== "undefined" ? navigator.userAgent : ""
    );
    if (!isMobile) {
      window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
      return;
    }
    setNotice("正在打開 WhatsApp 分享...");
    window.location.href = `whatsapp://send?text=${encoded}`;
  };

  return (
    <div className="mt-3 max-w-3xl rounded-xl border border-indigo-100 bg-white p-3">
      <p className="text-xs leading-5 text-gray-500">
        把此連結發給學生。學生打開後會到增分寶主頁，再按「新用戶註冊」，教師編號會自動填上。
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          value={shareUrl}
          aria-label="學生註冊連結"
          className="min-w-0 flex-1 rounded-xl border-2 border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-xs text-slate-800 outline-none"
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            複製
          </button>
          <button
            type="button"
            onClick={handleWhatsApp}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={WHATSAPP_ICON_PATH} alt="" aria-hidden className="h-4 w-4 invert" />
            WhatsApp
          </button>
        </div>
      </div>
      {notice && <p className="mt-2 text-xs font-semibold text-indigo-700">{notice}</p>}
    </div>
  );
}
