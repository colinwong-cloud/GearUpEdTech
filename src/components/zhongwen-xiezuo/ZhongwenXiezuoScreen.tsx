"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GuoyuBrandHeader } from "@/components/guoyu/GuoyuBrandHeader";
import { sanitizeGuoyuInput, countGuoyuChars } from "@/lib/guoyu/text";
import {
  hasZhongwenXiezuoInput,
  ZHONGWEN_XIEZUO_PHRASE_DELIMITER_HINT,
  ZHONGWEN_XIEZUO_PHRASE_MIN_COUNT_HINT,
} from "@/lib/zhongwen-xiezuo/content";
import type { ZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";
import { ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL } from "@/lib/zhongwen-xiezuo/rhetoric";
import {
  formatZhongwenXiezuoQuotaLine,
  type ZhongwenXiezuoQuotaView,
} from "@/lib/zhongwen-xiezuo/quota-copy";
import { ZhongwenXiezuoQuotaCircles } from "@/components/zhongwen-xiezuo/ZhongwenXiezuoQuotaCircles";

type QuotaPayload = {
  rpc_ready: boolean;
  remaining: number;
  cap: number;
  is_paid_parent: boolean;
  is_tutor_parent?: boolean;
};

export type ZhongwenXiezuoScreenProps = {
  studentId: string;
  initialText?: string;
  onBack: () => void;
  onUpgrade: () => void;
};

export function ZhongwenXiezuoScreen({
  studentId,
  initialText = "",
  onBack,
  onUpgrade,
}: ZhongwenXiezuoScreenProps) {
  const [text, setText] = useState(initialText);
  const [quota, setQuota] = useState<QuotaPayload | null>(null);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [content, setContent] = useState<ZhongwenXiezuoGeneratedContent | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const quotaView: ZhongwenXiezuoQuotaView | null = useMemo(() => {
    if (!quota) return null;
    return {
      remaining: quota.remaining,
      cap: quota.cap,
      isPaidMit: quota.is_paid_parent,
    };
  }, [quota]);

  const quotaExhausted = Boolean(
    quota?.rpc_ready && quota.remaining <= 0
  );
  const hasEnoughPhrases = hasZhongwenXiezuoInput(text);
  const showPhraseCountHint =
    text.trim().length > 0 && !hasEnoughPhrases && !generateBusy;
  const canGenerate =
    hasEnoughPhrases && !generateBusy && !quotaExhausted;

  const refreshQuota = useCallback(async () => {
    const res = await fetch("/api/zhongwen-xiezuo/quota", {
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
    document.title = "中文寫作練習｜增分寶";
  }, []);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerateBusy(true);
    setGenerateError(null);
    setPdfError(null);
    try {
      const res = await fetch("/api/zhongwen-xiezuo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, text }),
      });
      const payload = (await res.json()) as {
        data?: {
          content: ZhongwenXiezuoGeneratedContent;
          source_text: string;
          quota: QuotaPayload;
        };
        error?: string;
        quota?: QuotaPayload;
      };
      if (!res.ok || !payload.data) {
        setGenerateError(payload.error || "無法產生練習，請稍後再試。");
        if (payload.quota) setQuota(payload.quota);
        else await refreshQuota();
        return;
      }
      setContent(payload.data.content);
      setPreviewText(payload.data.source_text);
      if (payload.data.quota) setQuota(payload.data.quota);
      else await refreshQuota();
    } catch {
      setGenerateError("無法產生練習，請稍後再試。");
    } finally {
      setGenerateBusy(false);
    }
  };

  const downloadPdf = async (kind: "practice" | "answer") => {
    if (!content) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch("/api/zhongwen-xiezuo/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, kind, content }),
      });
      if (!res.ok) {
        const errPayload = (await res.json()) as { error?: string };
        setPdfError(errPayload.error || "未能下載 PDF。");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "answer" ? "中文寫作-答案卷.pdf" : "中文寫作-練習卷.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("未能下載 PDF。");
    } finally {
      setPdfBusy(false);
    }
  };

  const len = countGuoyuChars(text);

  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4 pb-10"
      lang="zh-Hant"
    >
      <div className="w-full max-w-md">
        <GuoyuBrandHeader logoAlt="增分寶" />
        <h1 className="text-2xl font-bold text-gray-900">中文寫作練習</h1>
        <p className="mt-1 text-sm text-gray-500">
          輸入自訂詞語，產生三頁學生練習卷及家長答案卷
        </p>

        <section className="mt-6 space-y-4 rounded-2xl border border-indigo-100 bg-white/90 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">自訂詞語／句式</h2>
          <p className="text-xs text-gray-500">
            {ZHONGWEN_XIEZUO_PHRASE_DELIMITER_HINT}
            範文將按學生年級調整難度，並運用修辭（含誇張）：{ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL}。
          </p>
          {quotaView && (
            <ZhongwenXiezuoQuotaCircles view={quotaView} onUpgrade={onUpgrade} />
          )}
          <textarea
            value={text}
            onChange={(e) => {
              setText(sanitizeGuoyuInput(e.target.value));
              setGenerateError(null);
            }}
            placeholder="例：晴朗&#10;微風徐徐&#10;歡聲笑語"
            className="min-h-[140px] w-full rounded-xl border-2 border-gray-200 px-3 py-3 text-base focus:border-indigo-400 focus:outline-none"
          />
          <p className="text-right text-xs text-gray-500">{len} 字</p>
          {showPhraseCountHint && (
            <p className="text-sm text-amber-700">{ZHONGWEN_XIEZUO_PHRASE_MIN_COUNT_HINT}</p>
          )}
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
            {generateBusy ? "正在產生…" : "產生"}
          </button>
        </section>

        <section className="mt-6 space-y-4 rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">輸出</h2>
          {!content ? (
            <p className="text-sm text-gray-500">按「產生」後，練習內容會顯示於此。</p>
          ) : (
            <div className="space-y-3 text-sm text-gray-700">
              <p className="font-medium text-gray-900">已產生三頁練習（兩頁填空＋範文抄寫）</p>
              {previewText && (
                <p className="text-xs text-gray-500">詞語：{previewText.slice(0, 120)}</p>
              )}
              <details className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <summary className="cursor-pointer font-semibold text-gray-800">預覽範文</summary>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{content.essay}</p>
                {content.rhetoric_marks.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-600">
                    {content.rhetoric_marks.map((m, i) => (
                      <li key={`${m.device}-${i}`}>
                        【{m.device === "夸張" ? "誇張" : m.device}】{m.excerpt}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </div>
          )}
          {quotaView && (
            <p className="text-xs text-gray-500">{formatZhongwenXiezuoQuotaLine(quotaView)}</p>
          )}
          {pdfError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{pdfError}</p>
          )}
          <button
            type="button"
            disabled={!content || pdfBusy}
            onClick={() => void downloadPdf("practice")}
            className={`w-full rounded-xl py-3.5 font-semibold text-white transition ${
              content && !pdfBusy
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "cursor-not-allowed bg-gray-300"
            }`}
          >
            {pdfBusy ? "準備 PDF…" : "下載 PDF"}
          </button>
          {content && (
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => void downloadPdf("answer")}
              className="w-full rounded-xl border border-indigo-200 bg-white py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              下載家長答案卷
            </button>
          )}
        </section>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-8 py-3.5 font-semibold text-sky-700 transition-all duration-200 hover:bg-sky-50"
        >
          返回
        </button>
      </div>
    </div>
  );
}
