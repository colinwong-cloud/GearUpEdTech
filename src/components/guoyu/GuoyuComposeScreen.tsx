"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  countGuoyuChars,
  GUOYU_IMAGE_ACCEPT,
  hasGuoyuPracticeContent,
  isAllowedGuoyuImageMime,
  sanitizeGuoyuInput,
} from "@/lib/guoyu/text";
import {
  formatGuoyuOcrQuotaLine,
  guoyuOcrUpsellVisible,
  type GuoyuOcrQuotaView,
} from "@/lib/guoyu/quota-copy";
import type { GuoyuWorksheetRow } from "@/lib/guoyu/worksheet";

type QuotaPayload = {
  rpc_ready: boolean;
  remaining: number;
  cap: number;
  is_paid_parent: boolean;
  is_tutor_parent?: boolean;
};

export type GuoyuComposeScreenProps = {
  studentId: string;
  initialText?: string;
  onBack: () => void;
  onUpgrade: () => void;
  onGenerated: (payload: {
    sourceText: string;
    rows: GuoyuWorksheetRow[];
  }) => void;
};

export function GuoyuComposeScreen({
  studentId,
  initialText = "",
  onBack,
  onUpgrade,
  onGenerated,
}: GuoyuComposeScreenProps) {
  const [text, setText] = useState(initialText);
  const [quota, setQuota] = useState<QuotaPayload | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrToast, setOcrToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const quotaView: GuoyuOcrQuotaView | null = useMemo(() => {
    if (!quota) return null;
    return {
      remaining: quota.remaining,
      cap: quota.cap,
      isPaidMit: quota.is_paid_parent,
    };
  }, [quota]);

  const ocrExhausted = Boolean(quotaView && quotaView.remaining <= 0 && quota?.rpc_ready);
  const canGenerate = hasGuoyuPracticeContent(text) && !ocrBusy && !generateBusy;

  const refreshQuota = useCallback(async () => {
    const res = await fetch("/api/guoyu/ocr-quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId }),
    });
    const payload = (await res.json()) as { data?: QuotaPayload; error?: string };
    if (payload.data) setQuota(payload.data);
  }, [studentId]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  useEffect(() => {
    document.title = "練習國語拼音｜增分寶 GearUp Quiz";
  }, []);

  const handleTextChange = (raw: string) => {
    const next = sanitizeGuoyuInput(raw);
    setText(next);
    setGenerateError(null);
  };

  const clearImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runOcr = async (file: File) => {
    setOcrError(null);
    setFileError(null);
    setOcrToast(null);
    if (!isAllowedGuoyuImageMime(file.type)) {
      setFileError("只接受 JPG、PNG、WebP，不支援 PDF 或 Word。");
      return;
    }
    setOcrBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((acc, b) => acc + String.fromCharCode(b), "")
      );
      const res = await fetch("/api/guoyu/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          mime_type: file.type,
          image_base64: base64,
        }),
      });
      const payload = (await res.json()) as {
        data?: { text: string; quota: QuotaPayload };
        error?: string;
      };
      if (!res.ok) {
        setOcrError(payload.error || "無法辨識文字，請重試或改為手動輸入。");
        return;
      }
      if (payload.data?.text) {
        setText(sanitizeGuoyuInput(payload.data.text));
        setOcrToast("已填入辨識結果，請檢查後再生成");
        if (payload.data.quota) setQuota(payload.data.quota);
        else await refreshQuota();
      }
    } catch {
      setOcrError("無法辨識文字，請重試或改為手動輸入。");
    } finally {
      setOcrBusy(false);
    }
  };

  const onFilePick = (file: File | null) => {
    if (!file) return;
    clearImage();
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    void runOcr(file);
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerateBusy(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/guoyu/pinyin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = (await res.json()) as {
        data?: { source_text: string; rows: GuoyuWorksheetRow[] };
        error?: string;
      };
      if (!res.ok || !payload.data) {
        setGenerateError(payload.error || "無法生成練習，請稍後再試。");
        return;
      }
      onGenerated({
        sourceText: payload.data.source_text,
        rows: payload.data.rows,
      });
    } catch {
      setGenerateError("無法生成練習，請稍後再試。");
    } finally {
      setGenerateBusy(false);
    }
  };

  const len = countGuoyuChars(text);
  const atCap = len >= 1000;

  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4 pb-10"
      lang="zh-Hant"
    >
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-8 py-3.5 font-semibold text-sky-700 transition-all duration-200 hover:bg-sky-50"
        >
          返回
        </button>

        <h1 className="text-2xl font-bold text-gray-900">練習國語拼音</h1>
        <p className="mt-1 text-sm text-gray-500">
          上傳課文或自行輸入，即時生成拼音練習
        </p>

        <p className="mt-5 text-sm font-semibold text-gray-800">使用方法：</p>
        <ol className="mt-2 list-decimal space-y-1 rounded-2xl border border-indigo-100 bg-white/90 px-4 py-4 pl-8 text-sm leading-7 text-gray-700 shadow-sm">
          <li>（可選）上傳課文／報紙相片，系統會用 OCR 轉成文字；或直接在下方輸入框打字。</li>
          <li>檢查並編輯文字（最多 1000 字，只接受中文及標點）。</li>
          <li>按「生成練習」進入拼音工作紙，並可朗讀全文。</li>
        </ol>

        {quotaView && (
          <p className="mt-4 text-sm text-gray-700">{formatGuoyuOcrQuotaLine(quotaView)}</p>
        )}
        {quotaView && guoyuOcrUpsellVisible(quotaView) && !quotaView.isPaidMit && (
            <button
              type="button"
              onClick={onUpgrade}
              className="mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
            >
              了解月費
            </button>
          )}

        <div className="mt-5 space-y-5">
          <div className={ocrExhausted ? "opacity-50 pointer-events-none" : ""}>
            <label className="text-sm font-semibold text-gray-800">
              上傳課文／報紙相片（選填）
            </label>
            <p className="mt-1 text-xs text-gray-500">
              只接受 JPG、PNG、WebP。請拍攝清晰課文或報紙文字。
            </p>
            <div
              className="mt-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-6 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (ocrExhausted || ocrBusy) return;
                const f = e.dataTransfer.files?.[0];
                if (f) onFilePick(f);
              }}
            >
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="預覽"
                  className="mb-3 max-h-40 rounded-lg border border-gray-200 object-contain"
                />
              )}
              {ocrBusy ? (
                <p className="text-sm text-indigo-700">正在辨識文字…</p>
              ) : (
                <button
                  type="button"
                  disabled={ocrExhausted}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
                >
                  選擇圖片
                </button>
              )}
              {previewUrl && !ocrBusy && (
                <button
                  type="button"
                  onClick={clearImage}
                  className="mt-2 text-xs text-gray-500 underline"
                >
                  清除
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={GUOYU_IMAGE_ACCEPT}
                className="hidden"
                onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
              />
            </div>
            {fileError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {fileError}
              </p>
            )}
            {ocrError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {ocrError}
              </p>
            )}
            {ocrToast && (
              <p className="mt-2 text-sm text-emerald-700">{ocrToast}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-800">練習文字</label>
            <textarea
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="在此貼上或輸入中文課文（最多 1000 字）"
              className="mt-2 min-h-[160px] w-full rounded-xl border-2 border-gray-200 px-3 py-3 text-base focus:border-indigo-400 focus:outline-none"
            />
            <p className={`mt-1 text-right text-xs ${atCap ? "text-rose-600" : "text-gray-500"}`}>
              {len}/1000
            </p>
          </div>

          {generateError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{generateError}</p>
          )}

          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => void handleGenerate()}
            className={`w-full rounded-xl py-3.5 font-semibold text-white transition ${
              canGenerate
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "cursor-not-allowed bg-indigo-200 text-white/80"
            }`}
          >
            {generateBusy ? "正在生成拼音…" : "生成練習"}
          </button>
        </div>
      </div>
    </div>
  );
}
