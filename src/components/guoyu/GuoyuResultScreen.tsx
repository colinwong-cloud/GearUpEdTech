"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GUOYU_TTS_DEFAULT_SPEED,
  GUOYU_TTS_SPEED_OPTIONS,
  type GuoyuWorksheetRow,
} from "@/lib/guoyu/worksheet";
import {
  guoyuTtsQuotaExhausted,
  type GuoyuTtsQuotaView,
} from "@/lib/guoyu/quota-copy";
import { filenameFromContentDisposition } from "@/lib/tutor-practice-paper";
import type { GuoyuWorksheetPdfKind } from "@/lib/guoyu/worksheet-pdf";
import { GuoyuTtsQuotaCircles } from "@/components/guoyu/GuoyuTtsQuotaCircles";

type TtsQuotaPayload = {
  rpc_ready: boolean;
  remaining: number;
  cap: number;
  is_paid_parent: boolean;
};

export type GuoyuResultScreenProps = {
  studentId: string;
  sourceText: string;
  rows: GuoyuWorksheetRow[];
  onBack: () => void;
  onUpgrade: () => void;
};

export function GuoyuResultScreen({
  studentId,
  sourceText,
  rows,
  onBack,
  onUpgrade,
}: GuoyuResultScreenProps) {
  const [speed, setSpeed] = useState(GUOYU_TTS_DEFAULT_SPEED);
  const [playing, setPlaying] = useState(false);
  const [ttsPending, setTtsPending] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [ttsQuota, setTtsQuota] = useState<TtsQuotaPayload | null>(null);
  const [pdfBusyKind, setPdfBusyKind] = useState<GuoyuWorksheetPdfKind | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const ttsInFlightRef = useRef(false);

  const ttsQuotaView: GuoyuTtsQuotaView | null = ttsQuota
    ? {
        remaining: ttsQuota.remaining,
        cap: ttsQuota.cap,
        isPaidMit: ttsQuota.is_paid_parent,
      }
    : null;

  const ttsExhausted = ttsQuota
    ? guoyuTtsQuotaExhausted(ttsQuota.remaining, ttsQuota.rpc_ready)
    : false;

  const refreshTtsQuota = useCallback(async () => {
    const res = await fetch("/api/guoyu/tts-quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId }),
    });
    const payload = (await res.json()) as { data?: TtsQuotaPayload; error?: string };
    if (payload.data) setTtsQuota(payload.data);
  }, [studentId]);

  useEffect(() => {
    document.title = "拼音練習｜增分寶 GearUp Quiz";
  }, []);

  useEffect(() => {
    void refreshTtsQuota();
  }, [refreshTtsQuota]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const stopPlayback = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  const startPlayback = async () => {
    if (ttsInFlightRef.current || ttsExhausted) return;
    ttsInFlightRef.current = true;
    setTtsPending(true);
    setTtsError(null);
    stopPlayback();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    try {
      const res = await fetch("/api/guoyu/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          text: sourceText,
          speaking_rate: speed,
        }),
      });
      const payload = (await res.json()) as {
        data?: {
          audio_base64: string;
          content_type: string;
          quota?: TtsQuotaPayload;
        };
        error?: string;
        quota?: TtsQuotaPayload;
      };
      if (payload.data?.quota) {
        setTtsQuota(payload.data.quota);
      } else if (payload.quota) {
        setTtsQuota(payload.quota);
      }
      if (!res.ok || !payload.data?.audio_base64) {
        if (res.status === 429) {
          setTtsError(payload.error || "本月朗讀額度已用完");
          return;
        }
        setTtsSupported(res.status !== 429);
        setTtsError(payload.error || "此瀏覽器暫不支援朗讀");
        return;
      }
      const binary = atob(payload.data.audio_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: payload.data.content_type || "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      await audio.play();
      setPlaying(true);
    } catch {
      setTtsSupported(false);
      setTtsError("此瀏覽器暫不支援朗讀");
    } finally {
      ttsInFlightRef.current = false;
      setTtsPending(false);
    }
  };

  const startReadAloudDisabled = ttsPending || playing || ttsExhausted;
  const startReadAloudLabel = ttsPending ? "處理中" : "開始朗讀";

  const downloadWorksheetPdf = async (kind: GuoyuWorksheetPdfKind) => {
    if (pdfBusyKind || !studentId.trim()) return;
    setPdfBusyKind(kind);
    setPdfError(null);
    try {
      const res = await fetch("/api/guoyu/worksheet-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          kind,
          rows,
          source_text: sourceText,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "未能下載 PDF。");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromContentDisposition(
        res.headers.get("Content-Disposition"),
        kind === "answer" ? "gearup-guoyu-answer.pdf" : "gearup-guoyu-practice.pdf"
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "未能下載 PDF。");
    } finally {
      setPdfBusyKind(null);
    }
  };

  if (!sourceText.trim() || rows.length === 0) {
    return (
      <div className="min-h-screen bg-white/60 px-4 py-10 text-center">
        <p className="text-gray-600">沒有練習內容</p>
        <button type="button" onClick={onBack} className="mt-4 text-indigo-600 underline">
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm px-4 pb-12 pt-6" lang="zh-Hant">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-gray-900">拼音練習</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
          >
            返回
          </button>
        </div>

        <div className="space-y-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          {rows.map((row, idx) => (
            <div key={`row-${idx}`} className="border-b border-gray-100 pb-4 last:border-0">
              <div className="flex flex-wrap gap-x-1 gap-y-2">
                {row.cells.map((cell, ci) => (
                  <span key={`c-${idx}-${ci}`} className="inline-flex flex-col items-center min-w-[1.25rem]">
                    <span className="text-xs text-indigo-600/90">{cell.pinyin || "·"}</span>
                    <span className="text-base text-gray-900">{cell.char}</span>
                  </span>
                ))}
              </div>
              {row.blankPracticeLine && (
                <div
                  className="mt-3 h-10 w-full border-b border-dashed border-gray-300"
                  aria-hidden
                />
              )}
            </div>
          ))}
        </div>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-900">讀出文章</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span className="font-medium">語速</span>
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="min-h-11 rounded-lg border border-gray-200 px-2 py-2 text-sm"
                disabled={playing || ttsPending || ttsExhausted}
              >
                {GUOYU_TTS_SPEED_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex gap-2">
                {ttsSupported && (
                  <button
                    type="button"
                    onClick={() => void startPlayback()}
                    disabled={startReadAloudDisabled}
                    aria-busy={ttsPending}
                    className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${
                      startReadAloudDisabled
                        ? "cursor-not-allowed bg-emerald-600/50"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {startReadAloudLabel}
                  </button>
                )}
                {playing && (
                  <button
                    type="button"
                    onClick={stopPlayback}
                    className="min-h-11 flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    停止
                  </button>
                )}
              </div>
              {ttsQuotaView && (
                <GuoyuTtsQuotaCircles view={ttsQuotaView} onUpgrade={onUpgrade} />
              )}
            </div>
          </div>
          {ttsError && <p className="mt-2 text-sm text-gray-600">{ttsError}</p>}
        </section>

        <section className="mt-8 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">下載練習 PDF</h2>
          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void downloadWorksheetPdf("practice")}
              disabled={Boolean(pdfBusyKind) || !studentId.trim()}
              className={`min-h-11 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white ${
                pdfBusyKind || !studentId.trim()
                  ? "cursor-not-allowed bg-indigo-600/50"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {pdfBusyKind === "practice" ? "處理中…" : "練習卷（空白拼音）"}
            </button>
            <button
              type="button"
              onClick={() => void downloadWorksheetPdf("answer")}
              disabled={Boolean(pdfBusyKind) || !studentId.trim()}
              className={`min-h-11 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white ${
                pdfBusyKind || !studentId.trim()
                  ? "cursor-not-allowed bg-sky-600/50"
                  : "bg-sky-600 hover:bg-sky-700"
              }`}
            >
              {pdfBusyKind === "answer" ? "處理中…" : "答案卷"}
            </button>
          </div>
          {pdfError && <p className="mt-2 text-sm text-gray-600">{pdfError}</p>}
        </section>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-sky-200 bg-white px-8 py-3.5 font-semibold text-sky-700 hover:bg-sky-50"
        >
          返回
        </button>
      </div>
    </div>
  );
}
