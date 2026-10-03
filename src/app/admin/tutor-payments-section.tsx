"use client";

import { useCallback, useEffect, useState } from "react";

type TutorEnquiry = {
  found: boolean;
  reason?: string;
  tutor?: {
    code: string;
    name: string;
    mobile: string;
    email: string;
    paid_until: string | null;
    active: boolean;
    recurring_active: boolean;
  };
  recurring?: {
    status: string | null;
    next_charge_at: string | null;
    last_charged_at: string | null;
    last_error: string | null;
    amount_hkd: number;
  } | null;
  orders?: Array<{
    id: string;
    merchant_order_id: string | null;
    amount_hkd: number;
    status: string | null;
    created_at: string | null;
    paid_at: string | null;
    payment_method_type?: string | null;
  }>;
};

type Monitor = {
  month: string;
  active_profiles: number;
  today: { due: number; initiated: number; success: number; failed: number; amount_hkd: number };
  days: Array<{ day: string; due: number; initiated: number; success: number; failed: number; amount_hkd: number }>;
};

type RefundPreview = {
  found: boolean;
  reason?: string;
  tutor?: { code: string; name: string; mobile: string };
  order?: { id: string; amount_hkd: number; paid_at: string | null; merchant_order_id: string | null } | null;
};

async function adminRequest<T>(action: string, payload: Record<string, unknown>, sessionToken: string): Promise<T> {
  const res = await fetch("/api/admin/console", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ action, payload }),
  });
  const body = (await res.json()) as { data?: T; error?: string };
  if (!res.ok) throw new Error(body.error || "操作失敗");
  return body.data as T;
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("zh-HK");
}

function formatHkd(amount: number): string {
  return Number.isFinite(amount) ? amount.toFixed(2) : "—";
}

function paymentStatusLabel(status: string | null | undefined): string {
  if (status === "paid") return "已付款";
  if (status === "failed") return "失敗";
  if (status === "created") return "未完成";
  return status || "—";
}

function paymentMethodLabel(method: string | null | undefined): string {
  const token = String(method || "").toLowerCase();
  if (token === "applepay" || token === "apple pay") return "Apple Pay";
  if (token === "googlepay" || token === "google pay") return "Google Pay";
  if (token === "card") return "銀行卡";
  return method || "—";
}

export function TutorPaymentsSection({ sessionToken }: { sessionToken: string }) {
  const [query, setQuery] = useState("");
  const [mobile, setMobile] = useState("");
  const [reason, setReason] = useState("");
  const [month, setMonth] = useState(() => {
    const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [enquiry, setEnquiry] = useState<TutorEnquiry | null>(null);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const loadMonitor = useCallback(async () => {
    try {
      const data = await adminRequest<Monitor>("tutor_payment_monitor", { month }, sessionToken);
      setMonitor(data);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "未能載入教師付款趨勢");
    }
  }, [month, sessionToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMonitor();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMonitor]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-bold text-gray-800">教師付款情況</h2>
        <p className="text-sm text-gray-500">以教師登記手機或 6 位教師編號查詢。進階版為 HK$199/月。</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="教師手機或教師編號"
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setMsg("");
              setEnquiry(null);
              void adminRequest<TutorEnquiry>("tutor_payment_enquiry", { query }, sessionToken)
                .then((data) => {
                  setEnquiry(data);
                  if (!data.found) setMsg("找不到此教師");
                  if (data.tutor?.mobile) setMobile(data.tutor.mobile);
                })
                .catch((err) => setMsg(err instanceof Error ? err.message : "查詢失敗"))
                .finally(() => setLoading(false));
            }}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "查詢中..." : "查詢"}
          </button>
        </div>
        {msg && <p className="text-sm text-rose-600">{msg}</p>}
        {enquiry?.found && enquiry.tutor && (
          <div className="space-y-2 text-sm text-gray-700">
            <p>教師：{enquiry.tutor.name || "—"} ｜ 編號：{enquiry.tutor.code} ｜ 手機：{enquiry.tutor.mobile}</p>
            <p>
              方案：{enquiry.tutor.active ? "已生效" : "未生效"}
              {enquiry.tutor.paid_until ? `，至 ${formatWhen(enquiry.tutor.paid_until)}` : ""}
            </p>
            <p>
              自動續費：{enquiry.recurring?.status || "沒有"}
              {enquiry.recurring ? `，每月 HKD ${formatHkd(enquiry.recurring.amount_hkd)}` : ""}
              {enquiry.recurring?.next_charge_at ? `，下次 ${formatWhen(enquiry.recurring.next_charge_at)}` : ""}
              {enquiry.recurring?.last_charged_at ? `，上次 ${formatWhen(enquiry.recurring.last_charged_at)}` : ""}
            </p>
            {enquiry.orders && enquiry.orders.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-2 pr-3">付款時間</th>
                      <th className="py-2 pr-3">金額</th>
                      <th className="py-2 pr-3">狀態</th>
                      <th className="py-2 pr-3">方式</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enquiry.orders.map((order) => (
                      <tr key={order.id} className="border-b border-gray-100">
                        <td className="py-2 pr-3">{formatWhen(order.paid_at || order.created_at)}</td>
                        <td className="py-2 pr-3">{formatHkd(order.amount_hkd)}</td>
                        <td className="py-2 pr-3">{paymentStatusLabel(order.status)}</td>
                        <td className="py-2 pr-3">{paymentMethodLabel(order.payment_method_type)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {enquiry.recurring?.last_error && <p className="text-rose-600">最近錯誤：{enquiry.recurring.last_error}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMsg("");
                  void adminRequest<{ paid_until: string }>("tutor_payment_grant_30", { mobile_number: enquiry.tutor?.mobile }, sessionToken)
                    .then((data) => setMsg(`已開通 30 日，至 ${formatWhen(data.paid_until)}`))
                    .catch((err) => setMsg(err instanceof Error ? err.message : "未能開通"));
                }}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700"
              >
                開通 30 日（不設自動續費）
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  void adminRequest<RefundPreview>("tutor_payment_refund_preview", { mobile_number: enquiry.tutor?.mobile }, sessionToken)
                    .then(setPreview)
                    .catch((err) => setMsg(err instanceof Error ? err.message : "未能預覽退款"));
                }}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
              >
                退款本月並停止續費
              </button>
            </div>
            {preview?.order && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 space-y-2">
                <p>本月收費 HKD {preview.order.amount_hkd.toFixed(2)}，付款時間 {formatWhen(preview.order.paid_at)}</p>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="退款原因"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => {
                    void adminRequest<{ refund_status: string }>("tutor_payment_refund_confirm", {
                      mobile_number: enquiry.tutor?.mobile,
                      order_id: preview.order?.id,
                      reason,
                    }, sessionToken)
                      .then((data) => setMsg(`退款已提交（${data.refund_status}），續費已停止。`))
                      .catch((err) => setMsg(err instanceof Error ? err.message : "退款失敗"));
                  }}
                  className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  確認退款
                </button>
              </div>
            )}
            {preview && !preview.order && <p className="text-gray-500">{preview.reason || "本月沒有可退款的收費。"}</p>}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-gray-800">教師 MIT 趨勢</h3>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        {monitor && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
              <p>今日需發起 {monitor.today.due}</p>
              <p>今日已發起 {monitor.today.initiated}</p>
              <p>今日成功 {monitor.today.success}</p>
              <p>今日失敗 {monitor.today.failed}</p>
            </div>
            <p className="text-xs text-gray-500">生效中的自動續費 {monitor.active_profiles} 個</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-3">日期</th>
                    <th className="py-2 pr-3">需發起</th>
                    <th className="py-2 pr-3">已發起</th>
                    <th className="py-2 pr-3">成功</th>
                    <th className="py-2 pr-3">失敗</th>
                    <th className="py-2 pr-3">成功金額</th>
                  </tr>
                </thead>
                <tbody>
                  {monitor.days.filter((day) => day.due || day.initiated).map((day) => (
                    <tr key={day.day} className="border-b border-gray-100">
                      <td className="py-2 pr-3">{day.day}</td>
                      <td className="py-2 pr-3">{day.due}</td>
                      <td className="py-2 pr-3">{day.initiated}</td>
                      <td className="py-2 pr-3">{day.success}</td>
                      <td className="py-2 pr-3">{day.failed}</td>
                      <td className="py-2 pr-3">{day.amount_hkd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-2">
        <h3 className="text-base font-bold text-gray-800">以手機操作</h3>
        <input
          value={mobile}
          onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="8 位教師登記手機"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setMsg("");
              void adminRequest<{ paid_until: string }>("tutor_payment_grant_30", { mobile_number: mobile }, sessionToken)
                .then((data) => setMsg(`已開通 30 日，至 ${formatWhen(data.paid_until)}`))
                .catch((err) => setMsg(err instanceof Error ? err.message : "未能開通"));
            }}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
          >
            開通 30 日
          </button>
          <button
            type="button"
            onClick={() => {
              void adminRequest<RefundPreview>("tutor_payment_refund_preview", { mobile_number: mobile }, sessionToken)
                .then(setPreview)
                .catch((err) => setMsg(err instanceof Error ? err.message : "未能預覽退款"));
            }}
            className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700"
          >
            查本月退款
          </button>
        </div>
      </div>
    </div>
  );
}
