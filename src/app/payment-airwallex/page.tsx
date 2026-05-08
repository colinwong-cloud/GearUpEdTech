"use client";

import Script from "next/script";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    Airwallex?: {
      init: (opts: {
        env: "demo" | "prod";
        enabledElements: string[];
      }) => Promise<{
        payments: {
          redirectToCheckout: (props: Record<string, unknown>) => void;
        };
      }>;
    };
  }
}

function getAirwallexEnv(): "demo" | "prod" {
  const env = (process.env.NEXT_PUBLIC_AIRWALLEX_ENV || "").trim().toLowerCase();
  return env === "prod" || env === "production" ? "prod" : "demo";
}

function PaymentAirwallexContent() {
  const searchParams = useSearchParams();
  const intentId = searchParams.get("intent_id") || "";
  const clientSecret = searchParams.get("client_secret") || "";
  const mobile = searchParams.get("mobile") || "";
  const paymentMethod = searchParams.get("payment_method") || "cards";
  const currency = searchParams.get("currency") || "HKD";
  const countryCode = searchParams.get("country_code") || "HK";
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.Airwallex)
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Airwallex) {
      setSdkReady(true);
      return;
    }
    const intervalId = window.setInterval(() => {
      if (window.Airwallex) {
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
        return ["card", "applepay", "googlepay", "alipayhk", "wechatpay"];
      case "apple_pay":
        return ["applepay"];
      case "google_pay":
        return ["googlepay"];
      case "alipay":
        return ["alipayhk"];
      case "wechat_pay":
        return ["wechatpay"];
      default:
        return ["card"];
    }
  }, [paymentMethod]);

  const appBaseUrl =
    (process.env.NEXT_PUBLIC_APP_BASE_URL || "").trim().replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");

  async function startCheckout() {
    if (!intentId || !clientSecret) {
      setError("缺少付款參數，請返回重試。");
      return;
    }
    if (!window.Airwallex) {
      setError("付款 SDK 載入失敗，請重新整理再試。");
      return;
    }

    setBooting(true);
    setError(null);
    try {
      const { payments } = await window.Airwallex.init({
        env: getAirwallexEnv(),
        enabledElements: ["payments"],
      });
      payments.redirectToCheckout({
        intent_id: intentId,
        client_secret: clientSecret,
        currency,
        country_code: countryCode,
        methods,
        successUrl: `${appBaseUrl}/payment-callback?result=success&mobile=${encodeURIComponent(
          mobile
        )}&intent_id=${encodeURIComponent(intentId)}`,
        cancelUrl: `${appBaseUrl}/payment-callback?result=cancel&mobile=${encodeURIComponent(
          mobile
        )}&intent_id=${encodeURIComponent(intentId)}`,
      });
    } catch {
      setError("未能啟動付款頁，請稍後重試。");
    } finally {
      setBooting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4">
      <Script
        src="https://checkout.airwallex.com/assets/elements.bundle.min.js"
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
        onReady={() =>
          setSdkReady(typeof window !== "undefined" && Boolean(window.Airwallex))
        }
      />
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">前往 Airwallex 付款</h1>
        <p className="mt-2 text-sm text-gray-600">請按下方按鈕進入安全付款頁面。</p>
        <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 space-y-1">
          <p>帳戶：{mobile || "—"}</p>
          <p>付款方式：{paymentMethod}</p>
          <p>幣別：{currency}</p>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={startCheckout}
          disabled={booting || !sdkReady}
          className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${
            booting || !sdkReady
              ? "bg-gray-200 text-gray-400"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          {booting ? "載入中..." : "進入 Airwallex 付款"}
        </button>
        <Link
          href="/"
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          返回主頁
        </Link>
      </div>
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
