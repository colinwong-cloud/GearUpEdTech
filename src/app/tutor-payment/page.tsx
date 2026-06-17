"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type TutorSubject = "Chinese" | "English" | "Math";
type TutorPlanCode = "tutor_monthly_1on1" | "tutor_monthly_1on2";

type CheckoutResponse = {
  paid?: boolean;
  message?: string;
  error?: string;
  intent_id?: string;
  client_secret?: string;
  payment_method?: string;
  currency?: string;
  country_code?: string;
  final_amount_hkd?: number;
  airwallex_env?: "demo" | "prod";
  airwallex_locale?: string;
  plan_name?: string;
};

const SUPABASE_BASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "");

const SUBJECT_CARDS: Array<{
  key: TutorSubject;
  label: string;
  imagePath: string;
}> = [
  {
    key: "Chinese",
    label: "Chinese",
    imagePath: "Webpage_images/tutor/chinese_tutor.png",
  },
  {
    key: "English",
    label: "English",
    imagePath: "Webpage_images/tutor/eng_tutor.png",
  },
  {
    key: "Math",
    label: "Math",
    imagePath: "Webpage_images/tutor/math_tutor.png",
  },
];

const PLAN_OPTIONS: Array<{
  code: TutorPlanCode;
  label: string;
  amount: number;
}> = [
  { code: "tutor_monthly_1on1", label: "$498 一對一補習", amount: 498 },
  { code: "tutor_monthly_1on2", label: "$298 與其他學生一同學習", amount: 298 },
];

function normalizeTutorSubject(raw: string | null): TutorSubject | null {
  const key = (raw || "").trim().toLowerCase();
  if (key === "chinese" || key === "chi" || key === "zh") return "Chinese";
  if (key === "english" || key === "eng" || key === "en") return "English";
  if (key === "math" || key === "maths" || key === "mathematics") return "Math";
  return null;
}

function getSubjectImageUrl(path: string): string {
  if (!SUPABASE_BASE_URL) return "";
  return `${SUPABASE_BASE_URL}/storage/v1/object/public/${path}`;
}

function TutorPaymentContent() {
  const searchParams = useSearchParams();
  const mobile = (searchParams.get("mobile") || "").trim();
  const initialSubject = normalizeTutorSubject(searchParams.get("subject"));
  const [selectedSubject, setSelectedSubject] = useState<TutorSubject | null>(
    initialSubject
  );
  const [selectedPlan, setSelectedPlan] = useState<TutorPlanCode | null>(
    "tutor_monthly_1on1"
  );
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedPlanMeta = useMemo(
    () => PLAN_OPTIONS.find((plan) => plan.code === selectedPlan) || null,
    [selectedPlan]
  );
  const canProceed = Boolean(mobile && selectedSubject && selectedPlan && !processing);

  const handleProceed = async () => {
    if (!mobile) {
      setError("缺少電話號碼，請返回練習結果頁再重試。");
      return;
    }
    if (!selectedSubject || !selectedPlanMeta) {
      setError("請先選擇科目及補習方案。");
      return;
    }

    setProcessing(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/payment/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile_number: mobile,
          plan_code: selectedPlanMeta.code,
          tutor_subject: selectedSubject,
        }),
      });
      const payload = (await res.json()) as CheckoutResponse;
      if (!res.ok) throw new Error(payload.error || "未能建立付款訂單");
      if (payload.paid) {
        setInfo(payload.message || "付款成功。");
        return;
      }

      if (!payload.intent_id || !payload.client_secret) {
        throw new Error("系統未返回完整付款參數，請稍後再試。");
      }

      const productLabel = `${selectedPlanMeta.label}（${selectedSubject}）`;
      const checkoutUrl = new URL("/payment-airwallex", window.location.origin);
      checkoutUrl.searchParams.set("intent_id", payload.intent_id);
      checkoutUrl.searchParams.set("client_secret", payload.client_secret);
      checkoutUrl.searchParams.set("mobile", mobile);
      checkoutUrl.searchParams.set("payment_method", payload.payment_method || "all");
      checkoutUrl.searchParams.set("currency", payload.currency || "HKD");
      checkoutUrl.searchParams.set("country_code", payload.country_code || "HK");
      checkoutUrl.searchParams.set(
        "final_amount_hkd",
        String(payload.final_amount_hkd ?? selectedPlanMeta.amount)
      );
      checkoutUrl.searchParams.set("airwallex_env", payload.airwallex_env || "prod");
      checkoutUrl.searchParams.set("airwallex_locale", payload.airwallex_locale || "zh-HK");
      checkoutUrl.searchParams.set("product_label", productLabel);
      checkoutUrl.searchParams.set("plan_name", payload.plan_name || selectedPlanMeta.label);
      window.location.href = checkoutUrl.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : "付款流程發生錯誤");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white/60 px-4 py-8">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-gray-500 hover:text-indigo-600">
            返回主頁
          </Link>
          <p className="text-xs text-gray-400">電話：{mobile || "—"}</p>
        </div>

        <div className="rounded-2xl bg-amber-50/70 p-4 text-gray-800">
          <p className="text-base font-semibold leading-relaxed">
            想針對佢嘅弱項即時增值？ 🌟 限時優惠：每月只需 $498
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm leading-6 text-gray-700">
            <li>每星期 1 小時網上互動體驗</li>
            <li>根據本次練習表現，精準對接 中／英／數 專業導師</li>
            <li>互動式教學，好玩又吸收得快！</li>
          </ul>
          <p className="mt-3 text-sm font-medium text-indigo-700">讓練習變成真正實力！</p>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700">1) 選擇科目</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {SUBJECT_CARDS.map((subject) => {
              const selected = selectedSubject === subject.key;
              return (
                <div
                  key={subject.key}
                  className={`rounded-2xl border p-3 transition ${
                    selected ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getSubjectImageUrl(subject.imagePath)}
                    alt={`${subject.label} tutor`}
                    className="h-44 w-full rounded-xl object-cover"
                    draggable={false}
                  />
                  <p className="mt-2 text-center text-sm font-medium text-gray-700">
                    {subject.label}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedSubject((prev) =>
                        prev === subject.key ? null : subject.key
                      )
                    }
                    className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      selected
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "border border-gray-300 bg-white text-gray-700 hover:border-indigo-300"
                    }`}
                  >
                    選擇名師
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700">2) 選擇方案</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {PLAN_OPTIONS.map((plan) => {
              const selected = selectedPlan === plan.code;
              return (
                <button
                  key={plan.code}
                  type="button"
                  onClick={() =>
                    setSelectedPlan((prev) => (prev === plan.code ? null : plan.code))
                  }
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    selected
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:border-indigo-300"
                  }`}
                >
                  {plan.label}
                </button>
              );
            })}
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {info ? <p className="mt-4 text-sm text-emerald-600">{info}</p> : null}

        <button
          type="button"
          onClick={handleProceed}
          disabled={!canProceed}
          className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold ${
            canProceed
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-gray-200 text-gray-400"
          }`}
        >
          {processing ? "處理中..." : "確認並前往付款"}
        </button>
      </div>
    </div>
  );
}

export default function TutorPaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white/60 px-4">
          <p className="text-sm text-gray-600">載入中...</p>
        </div>
      }
    >
      <TutorPaymentContent />
    </Suspense>
  );
}
