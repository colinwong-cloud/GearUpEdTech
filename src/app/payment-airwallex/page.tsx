"use client";

import Script from "next/script";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { buildApplePaySubscribeRequestOptions, buildMitHppRedirectProps } from "@/lib/airwallex-hpp-mit";
import { getPaymentTermsUrl } from "@/lib/payment-terms";
import { TUTOR_PLAN_PRICE_HKD } from "@/lib/tutor-billing";
const AIRWALLEX_SDK_SRC = "https://static.airwallex.com/components/sdk/v1/index.js";

type AirwallexPaymentsApi = {
  redirectToCheckout: (props: Record<string, unknown>) => void;
};

type AirwallexSdkLike = {
  init?: (opts: {
    env: "demo" | "prod";
    enabledElements: string[];
  }) => Promise<{ payments?: AirwallexPaymentsApi } | void> | { payments?: AirwallexPaymentsApi } | void;
  payments?: AirwallexPaymentsApi;
  createElement?: (name: string) => unknown;
  redirectToCheckout?: (props: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    Airwallex?: AirwallexSdkLike;
    AirwallexComponentsSDK?: AirwallexSdkLike;
    _AirwallexSDKs?: {
      payment?: AirwallexSdkLike;
    };
  }
}

function getAirwallexEnv(): "demo" | "prod" {
  const env = (process.env.NEXT_PUBLIC_AIRWALLEX_ENV || "").trim().toLowerCase();
  if (env === "demo" || env === "sandbox" || env === "test") return "demo";
  return "prod";
}

async function resolveAirwallexPaymentsApi(
  env: "demo" | "prod"
): Promise<AirwallexPaymentsApi> {
  const sdk =
    typeof window !== "undefined"
      ? window.AirwallexComponentsSDK ||
        window._AirwallexSDKs?.payment ||
        window.Airwallex
      : undefined;
  if (!sdk) {
    throw new Error("付款 SDK 尚未準備好，請稍候再試。");
  }

  if (typeof sdk.redirectToCheckout === "function") {
    return {
      redirectToCheckout: (props) => sdk.redirectToCheckout!(props),
    };
  }

  let payments: AirwallexPaymentsApi | undefined;
  if (typeof sdk.init === "function") {
    const initResult = await sdk.init({
      env,
      enabledElements: ["payments"],
    });
    const maybeResult =
      initResult && typeof initResult === "object"
        ? (initResult as { payments?: AirwallexPaymentsApi })
        : null;
    payments = maybeResult?.payments;
  }

  if (!payments && sdk.payments) {
    payments = sdk.payments;
  }

  if (!payments && typeof sdk.createElement === "function") {
    const maybePayments = sdk.createElement("payments") as AirwallexPaymentsApi | undefined;
    if (maybePayments && typeof maybePayments.redirectToCheckout === "function") {
      payments = maybePayments;
    }
  }

  if (!payments || typeof payments.redirectToCheckout !== "function") {
    throw new Error("付款 SDK 初始化失敗，請重新整理後再試。");
  }
  return payments;
}

function hasAirwallexSdk(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.AirwallexComponentsSDK ||
      window._AirwallexSDKs?.payment ||
      window.Airwallex
  );
}

function ensureAirwallexScript(): void {
  if (typeof document === "undefined") return;
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${AIRWALLEX_SDK_SRC}"]`
  );
  if (existing) return;
  const script = document.createElement("script");
  script.src = AIRWALLEX_SDK_SRC;
  script.async = true;
  script.setAttribute("data-airwallex-sdk", "true");
  document.head.appendChild(script);
}

async function waitForAirwallexSdkReady(timeoutMs = 10000): Promise<boolean> {
  if (hasAirwallexSdk()) return true;
  ensureAirwallexScript();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (hasAirwallexSdk()) return true;
  }
  return hasAirwallexSdk();
}

function PaymentAirwallexContent() {
  const searchParams = useSearchParams();
  const intentId = searchParams.get("intent_id") || "";
  const clientSecret = searchParams.get("client_secret") || "";
  const mobile = searchParams.get("mobile") || "";
  const payer = searchParams.get("payer") || "";
  const paymentMethod = searchParams.get("payment_method") || "cards";
  const currency = searchParams.get("currency") || "HKD";
  const countryCode = searchParams.get("country_code") || "HK";
  const checkoutLocale = searchParams.get("airwallex_locale") || "zh-HK";
  const customerId =
    searchParams.get("customer_id") ||
    searchParams.get("airwallex_customer_id") ||
    "";
  const finalAmountRaw = Number(searchParams.get("final_amount_hkd") || "99");
  const finalAmount = Number.isFinite(finalAmountRaw) ? Math.max(finalAmountRaw, 0) : 99;
  const envOverride = (searchParams.get("airwallex_env") || "").toLowerCase();
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(() => hasAirwallexSdk());
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsText, setTermsText] = useState("");
  const [loadingTerms, setLoadingTerms] = useState(false);
  const isTutor = payer === "tutor";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hasAirwallexSdk()) {
      setSdkReady(true);
      return;
    }
    const intervalId = window.setInterval(() => {
      if (hasAirwallexSdk()) {
        setSdkReady(true);
        window.clearInterval(intervalId);
      }
    }, 500);
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
    }, 15000);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  const methods = useMemo(() => {
    switch (paymentMethod) {
      case "all":
        return ["card", "applepay", "googlepay"];
      case "apple_pay":
        return ["applepay"];
      case "google_pay":
        return ["googlepay"];
      default:
        return ["card"];
    }
  }, [paymentMethod]);

  const appBaseUrl =
    (process.env.NEXT_PUBLIC_APP_BASE_URL || "").trim().replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");

  async function openTerms() {
    setShowTerms(true);
    if (termsText || loadingTerms) return;
    setLoadingTerms(true);
    try {
      const resp = await fetch(getPaymentTermsUrl(), { cache: "no-store" });
      const text = await resp.text();
      setTermsText(text || "未能載入付款條款，請稍後再試。");
    } catch {
      setTermsText("未能載入付款條款，請稍後再試。");
    } finally {
      setLoadingTerms(false);
    }
  }

  async function startCheckout() {
    if (isTutor && !agreed) {
      setError("請先同意付款條款。");
      return;
    }
    if (!intentId || !clientSecret) {
      setError("缺少付款參數，請返回重試。");
      return;
    }
    if (!customerId.trim()) {
      setError("缺少 customer_id，無法建立下月自動續費授權。請返回重新發起付款。");
      return;
    }
    const ready = await waitForAirwallexSdkReady();
    if (!ready) {
      setError("付款 SDK 載入失敗，請重新整理再試。");
      return;
    }

    setBooting(true);
    setError(null);
    try {
      const env = envOverride === "prod" || envOverride === "production" ? "prod" : getAirwallexEnv();
      const payments = await resolveAirwallexPaymentsApi(env);
      // Browser/OS only affects wallet button visibility on Airwallex HPP.
      // MIT consent fields are always passed for every browser below.
      const applePayRequestOptions = methods.includes("applepay")
        ? buildApplePaySubscribeRequestOptions({
            countryCode,
            amount: finalAmount,
          })
        : undefined;
      payments.redirectToCheckout(
        buildMitHppRedirectProps({
          intentId,
          clientSecret,
          currency,
          countryCode,
          locale: checkoutLocale,
          customerId,
          methods,
          termsOfUse: {
            payment_amount_type: "FIXED",
            fixed_payment_amount: finalAmount,
            payment_currency: "HKD",
            payment_schedule: { period: 1, period_unit: "MONTH" },
          },
          applePayRequestOptions,
          successUrl:
            payer === "tutor"
              ? `${appBaseUrl}/tutor?billing=success&intent_id=${encodeURIComponent(intentId)}`
              : `${appBaseUrl}/payment-callback?result=success&mobile=${encodeURIComponent(
                  mobile
                )}&intent_id=${encodeURIComponent(intentId)}`,
          cancelUrl:
            payer === "tutor"
              ? `${appBaseUrl}/tutor?billing=cancel`
              : `${appBaseUrl}/payment-callback?result=cancel&mobile=${encodeURIComponent(
                  mobile
                )}&intent_id=${encodeURIComponent(intentId)}`,
        })
      );
    } catch {
      setError("未能啟動付款頁，請稍後重試。");
    } finally {
      setBooting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4">
      <Script
        src={AIRWALLEX_SDK_SRC}
        strategy="afterInteractive"
        onLoad={() => setSdkReady(hasAirwallexSdk())}
        onReady={() => setSdkReady(hasAirwallexSdk())}
      />
      <div className={`w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${isTutor ? "max-w-lg" : "max-w-md"}`}>
        <h1 className="text-xl font-bold text-gray-900">前往 Airwallex 付款</h1>
        <p className="mt-2 text-sm text-gray-600">
          {isTutor ? "請先了解進階版內容，同意付款條款後進入安全付款頁面。" : "請按下方按鈕進入安全付款頁面。"}
        </p>
        {isTutor ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-3 text-sm text-indigo-950">
              <p className="font-semibold">導師進階版 HK${TUTOR_PLAN_PRICE_HKD}/月</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-indigo-900">
                <li>可無限生成練習卷，不再受每月 4 份限制。</li>
                <li>顯示這位學生最近 10 次練習的真實平均正確率，以及在同學中的排名。</li>
                <li>比較同校同年級、同區同年級，以及全部同年級。</li>
                <li>可另選一個年級和學校，查看該組的真實比較。</li>
                <li>未付款時只看到示例，並非這位學生的真實數據。</li>
                <li>每月由已授權的付款方式自動續費。</li>
              </ul>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  本人確認已閱讀並同意本平台的
                  <button
                    type="button"
                    onClick={() => void openTerms()}
                    className="ml-1 text-indigo-600 underline hover:text-indigo-700"
                  >
                    付款條款及細則
                  </button>
                </span>
              </label>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 space-y-1">
            <p>帳戶：{mobile || "—"}</p>
            <p>付款方式：{paymentMethod}</p>
            <p>幣別：{currency}</p>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={startCheckout}
          disabled={booting || !sdkReady || (isTutor && !agreed)}
          className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${
            booting || !sdkReady || (isTutor && !agreed)
              ? "bg-gray-200 text-gray-400"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          {booting ? "載入中..." : "進入 Airwallex 付款"}
        </button>
        <Link
          href={isTutor ? "/tutor" : "/"}
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          {isTutor ? "返回導師頁" : "返回主頁"}
        </Link>
      </div>
      {isTutor && showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-800">付款條款及細則</h2>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                關閉
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto px-4 py-3">
              {loadingTerms ? (
                <p className="text-sm text-gray-500">載入中...</p>
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-gray-700">{termsText}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentAirwallexPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-gray-900">前往 Airwallex 付款</h1>
            <p className="mt-3 text-sm text-gray-700">正在載入付款頁面...</p>
          </div>
        </div>
      }
    >
      <PaymentAirwallexContent />
    </Suspense>
  );
}
