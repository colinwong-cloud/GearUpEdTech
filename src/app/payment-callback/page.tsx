"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type VerifyResponse = {
  paid?: boolean;
  status?: string;
  already_finalized?: boolean;
  error?: string;
};

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const result = (searchParams.get("result") || "").toLowerCase();
  const intentId = searchParams.get("intent_id") || "";
  const mobile = searchParams.get("mobile") || "";
  const [loading, setLoading] = useState(Boolean(intentId));
  const [message, setMessage] = useState("正在確認付款狀態...");
  const [detail, setDetail] = useState("");

  const heading = useMemo(() => {
    if (loading) return "付款處理中";
    if (result === "cancel") return "付款已取消";
    return "付款結果";
  }, [loading, result]);

  useEffect(() => {
    if (!intentId) {
      setLoading(false);
      if (result === "cancel") {
        setMessage("你已取消付款。");
      } else {
        setMessage("未找到付款識別碼，請返回後重試。");
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/payment/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_intent_id: intentId }),
        });
        const payload = (await res.json()) as VerifyResponse;
        if (cancelled) return;
        if (!res.ok) {
          setMessage("付款狀態確認失敗");
          setDetail(payload.error || "請稍後到戶口管理再次確認。");
          return;
        }
        if (payload.paid) {
          setMessage("付款成功，已升級為月費用戶。");
          setDetail(payload.already_finalized ? "此訂單早前已完成處理。" : "會員資格已自動生效。");
        } else {
          setMessage("付款尚未完成");
          setDetail(
            payload.status
              ? `目前狀態：${payload.status}`
              : "請稍後再回到此頁，或於戶口頁重新付款。"
          );
        }
      } catch {
        if (cancelled) return;
        setMessage("付款狀態確認失敗");
        setDetail("請稍後到戶口管理再次確認。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intentId, result]);

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">{heading}</h1>
        <p className="mt-3 text-sm text-gray-700">{message}</p>
        {detail ? <p className="mt-2 text-xs text-gray-500">{detail}</p> : null}
        {mobile ? (
          <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            帳戶：{mobile}
          </p>
        ) : null}
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            返回主頁
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">付款處理中</h1>
          <p className="mt-3 text-sm text-gray-700">正在載入付款結果...</p>
        </div>
      </div>
    }>
      <PaymentCallbackContent />
    </Suspense>
  );
}
