"use client";

import { useState } from "react";

type GuoyuQuotaKind = "ocr" | "tts";

export type GuoyuAdminQuotaView = {
  parent_id: string;
  mobile_number: string;
  parent_name: string | null;
  hkt_month: string;
  /** effective_cap — 目前上限 */
  cap: number;
  tier_cap?: number;
  admin_cap?: number | null;
  usage_count: number;
  remaining: number;
  is_paid_parent: boolean;
  is_tutor_parent: boolean;
  has_usage_row: boolean;
};

type GuoyuAdminQuotaGetResponse = GuoyuAdminQuotaView & { found: true };

type GuoyuAdminQuotaAdjustResult = {
  ok: true;
  mobile_number: string;
  hkt_month: string;
  remaining_before: number;
  remaining_after: number;
  amount: number;
  direction: "increase" | "decrease";
};

type GuoyuAdminConsoleAction =
  | "get_guoyu_ocr_quota_by_mobile"
  | "adjust_guoyu_ocr_quota_by_mobile"
  | "get_guoyu_tts_quota_by_mobile"
  | "adjust_guoyu_tts_quota_by_mobile";

async function guoyuAdminConsoleRequest<T>(
  action: GuoyuAdminConsoleAction,
  payload: Record<string, unknown>,
  sessionToken: string
): Promise<T> {
  const res = await fetch("/api/admin/console", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ action, payload }),
  });
  const body = (await res.json()) as { data?: T; error?: string };
  if (!res.ok) {
    throw new Error(body.error || "操作失敗");
  }
  return body.data as T;
}

function tierLabel(view: GuoyuAdminQuotaView): string {
  if (view.is_tutor_parent) return "導師";
  if (view.is_paid_parent) return "月費用戶";
  return "免費用戶";
}

function capHint(view: GuoyuAdminQuotaView): string {
  const tierCap = view.tier_cap ?? view.cap;
  const hasAdminGrant =
    view.cap > tierCap ||
    (view.admin_cap != null && view.admin_cap > tierCap);
  if (hasAdminGrant) {
    return `（${tierLabel(view)} · 管理員加額）`;
  }
  return `（${tierLabel(view)}）`;
}

function kindProductLabel(kind: GuoyuQuotaKind): "OCR" | "朗讀" {
  return kind === "ocr" ? "OCR" : "朗讀";
}

function sectionTitle(kind: GuoyuQuotaKind): string {
  return kind === "ocr" ? "OCR 配額維護" : "TTS 配額維護";
}

function getAction(kind: GuoyuQuotaKind): GuoyuAdminConsoleAction {
  return kind === "ocr" ? "get_guoyu_ocr_quota_by_mobile" : "get_guoyu_tts_quota_by_mobile";
}

function adjustAction(kind: GuoyuQuotaKind): GuoyuAdminConsoleAction {
  return kind === "ocr" ? "adjust_guoyu_ocr_quota_by_mobile" : "adjust_guoyu_tts_quota_by_mobile";
}

export function GuoyuQuotaMaintainBlock({
  kind,
  sessionToken,
}: {
  kind: GuoyuQuotaKind;
  sessionToken: string;
}) {
  const productLabel = kindProductLabel(kind);
  const [searchVal, setSearchVal] = useState("");
  const [quota, setQuota] = useState<GuoyuAdminQuotaView | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [amountError, setAmountError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [writeLoading, setWriteLoading] = useState(false);
  const loading = searchLoading || writeLoading;
  const [confirmPending, setConfirmPending] = useState<{
    direction: "increase" | "decrease";
    amount: number;
    before: number;
    after: number;
  } | null>(null);
  const [lastOp, setLastOp] = useState<{
    mobile: string;
    before: number;
    after: number;
    hkt_month: string;
    direction: "increase" | "decrease";
    amount: number;
  } | null>(null);

  const handleSearch = async () => {
    const mobile = searchVal.trim();
    if (!mobile) return;
    setSearchLoading(true);
    setMsg("");
    setAmountError("");
    setQuota(null);
    setConfirmPending(null);
    setLastOp(null);
    try {
      const data = await guoyuAdminConsoleRequest<
        GuoyuAdminQuotaGetResponse | { found: false }
      >(getAction(kind), { p_mobile: mobile }, sessionToken);
      if (!data || !("found" in data) || data.found === false) {
        setMsg("找不到此電話號碼");
        return;
      }
      const view = { ...data };
      delete (view as { found?: boolean }).found;
      setQuota(view as GuoyuAdminQuotaView);
    } catch {
      setMsg("搜尋失敗");
    } finally {
      setSearchLoading(false);
    }
  };

  const projectedRemaining = (
    direction: "increase" | "decrease",
    amount: number
  ): number | null => {
    if (!quota) return null;
    if (direction === "increase") {
      return Math.min(10, quota.remaining + amount);
    }
    return Math.max(0, quota.remaining - amount);
  };

  const validateAmount = (direction: "increase" | "decrease"): number | null => {
    if (!quota) {
      setAmountError("請先查詢家長電話");
      return null;
    }
    const amount = parseInt(adjustAmount, 10);
    if (!amount || amount <= 0) {
      setAmountError("請輸入有效數量");
      return null;
    }
    const after = projectedRemaining(direction, amount);
    if (after === null) return null;
    if (after < 0) {
      setAmountError("調整後尚餘不可低於 0");
      return null;
    }
    if (after > 10) {
      setAmountError("調整後尚餘不可高於 10");
      return null;
    }
    setAmountError("");
    return amount;
  };

  const requestConfirm = (direction: "increase" | "decrease") => {
    setMsg("");
    const amount = validateAmount(direction);
    if (amount === null || !quota) return;
    const after = projectedRemaining(direction, amount)!;
    setConfirmPending({
      direction,
      amount,
      before: quota.remaining,
      after,
    });
  };

  const handleAdjust = async () => {
    if (!confirmPending || !quota) return;
    const { direction, amount } = confirmPending;
    setWriteLoading(true);
    setMsg("");
    try {
      const result = await guoyuAdminConsoleRequest<GuoyuAdminQuotaAdjustResult>(
        adjustAction(kind),
        {
          p_mobile: quota.mobile_number,
          p_direction: direction,
          p_amount: amount,
        },
        sessionToken
      );
      setLastOp({
        mobile: result.mobile_number,
        before: result.remaining_before,
        after: result.remaining_after,
        hkt_month: result.hkt_month,
        direction,
        amount,
      });
      const verb = direction === "increase" ? "增加" : "減少";
      setMsg(
        `成功${verb}本月${productLabel}尚餘 ${amount} 次（${result.remaining_before} → ${result.remaining_after}）`
      );
      setAdjustAmount("");
      setConfirmPending(null);
      const refreshed = await guoyuAdminConsoleRequest<
        GuoyuAdminQuotaGetResponse | { found: false }
      >(getAction(kind), { p_mobile: quota.mobile_number }, sessionToken);
      if (refreshed && "found" in refreshed && refreshed.found) {
        const next = { ...refreshed };
        delete (next as { found?: boolean }).found;
        setQuota(next as GuoyuAdminQuotaView);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("clamp") || message.includes("範圍")) {
        setMsg("調整超出允許範圍，請重新查詢後再試");
      } else {
        setMsg("調整失敗");
      }
    } finally {
      setWriteLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">{sectionTitle(kind)}</h2>
      <p className="text-xs text-gray-500">
        輸入家長電話，查詢本月（香港時間）尚餘額度。
      </p>
      <div className="flex gap-2">
        <input
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="輸入電話號碼"
          className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !searchVal.trim()}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {searchLoading ? "查詢中…" : "查詢"}
        </button>
      </div>

      {msg && !quota && <p className="text-sm text-red-500">{msg}</p>}

      {quota && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-sm text-gray-600">
            家長：{quota.mobile_number}
            {quota.parent_name ? `（${quota.parent_name}）` : ""}
          </p>
          <p className="text-sm text-gray-600">
            月份：{quota.hkt_month}（香港時間）
          </p>
          <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 text-sm space-y-1">
            <p className="font-semibold text-sky-800">
              本月尚餘：{quota.remaining} 次
            </p>
            <p className="text-xs text-sky-700">
              目前上限：{quota.cap} 次{capHint(quota)}
            </p>
            <p className="text-xs text-sky-700">
              本月已用：{quota.usage_count} 次
            </p>
            {!quota.has_usage_row && (
              <p className="text-xs text-sky-600">
                本月尚未有使用紀錄；尚餘等同目前上限。
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-700">調整數量</label>
            <input
              value={adjustAmount}
              onChange={(e) => {
                setAdjustAmount(e.target.value.replace(/\D/g, ""));
                setAmountError("");
                setConfirmPending(null);
              }}
              placeholder="調整數量"
              className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
            />
            <p className="text-xs text-gray-500">
              輸入正整數；調整後尚餘不可低於 0、不可高於 10。
            </p>
            {amountError && (
              <p className="text-sm text-red-500">{amountError}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => requestConfirm("increase")}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              增加
            </button>
            <button
              type="button"
              onClick={() => requestConfirm("decrease")}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
            >
              減少
            </button>
          </div>

          {confirmPending && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-900">確認調整</p>
              <p className="text-sm text-amber-900">
                將為 {quota.mobile_number} 的本月{productLabel}尚餘{" "}
                <strong>
                  {confirmPending.direction === "increase" ? "增加" : "減少"}{" "}
                  {confirmPending.amount} 次
                </strong>
                （{confirmPending.before} → {confirmPending.after}）。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAdjust}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  確認調整
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPending(null)}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {msg && (
            <p
              className={`text-sm ${
                msg.includes("成功") ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {msg}
            </p>
          )}

          {lastOp && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-emerald-700">
              上次操作：電話 {lastOp.mobile} · {productLabel} · {lastOp.before} →{" "}
              {lastOp.after} 次（{lastOp.hkt_month}）
            </div>
          )}
        </div>
      )}
    </div>
  );
}
