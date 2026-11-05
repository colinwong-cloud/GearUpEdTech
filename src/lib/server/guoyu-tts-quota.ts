import { getCurrentHktMonthKey } from "@/lib/admin-paid-summary";
import {
  computeGuoyuOcrCap,
  computeGuoyuOcrRemaining,
} from "@/lib/guoyu/ocr-cap";
import {
  GUOYU_FREE_OCR_CAP,
  GUOYU_PAID_OCR_CAP,
} from "@/lib/guoyu/quota-copy";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveGuoyuOcrCapFallback,
  resolveStudentParent,
} from "@/lib/server/guoyu-ocr-quota";

export { resolveStudentParent };

export type GuoyuTtsQuotaStatus = {
  rpc_ready: boolean;
  remaining: number;
  cap: number;
  is_paid_parent: boolean;
  is_tutor_parent: boolean;
  hkt_month: string;
  usage_count: number;
};

type RpcQuotaRow = {
  remaining?: number;
  cap?: number;
  usage_count?: number;
  hkt_month?: string;
  is_paid_parent?: boolean;
  is_tutor_parent?: boolean;
};

function mapRpcQuotaRow(row: RpcQuotaRow | null, fallback: GuoyuTtsQuotaStatus): GuoyuTtsQuotaStatus {
  const cap = Number(row?.cap ?? fallback.cap);
  const usage = Number(row?.usage_count ?? fallback.usage_count);
  return {
    rpc_ready: true,
    cap,
    usage_count: usage,
    remaining: Number(row?.remaining ?? computeGuoyuOcrRemaining(cap, usage)),
    is_paid_parent: Boolean(row?.is_paid_parent ?? cap === GUOYU_PAID_OCR_CAP),
    is_tutor_parent: Boolean(row?.is_tutor_parent),
    hkt_month: String(row?.hkt_month ?? fallback.hkt_month),
  };
}

export async function readGuoyuTtsQuota(
  admin: SupabaseClient,
  parentId: string,
  parentMobile: string
): Promise<GuoyuTtsQuotaStatus> {
  const hktMonth = getCurrentHktMonthKey();
  const fallbackMeta = await resolveGuoyuOcrCapFallback(admin, parentId, parentMobile);
  const fallback: GuoyuTtsQuotaStatus = {
    rpc_ready: false,
    remaining: fallbackMeta.cap,
    cap: fallbackMeta.cap,
    is_paid_parent: fallbackMeta.is_paid_parent,
    is_tutor_parent: fallbackMeta.is_tutor_parent,
    hkt_month: hktMonth,
    usage_count: 0,
  };

  const { data, error } = await admin.rpc("get_parent_guoyu_tts_quota", {
    p_parent_id: parentId,
  });

  if (error) {
    const msg = String(error.message || "");
    const rpcMissing =
      msg.includes("get_parent_guoyu_tts_quota") ||
      msg.includes("Could not find the function") ||
      error.code === "PGRST202";
    if (rpcMissing) {
      return fallback;
    }
    throw new Error(msg || "查詢朗讀額度失敗");
  }

  return mapRpcQuotaRow(data as RpcQuotaRow, fallback);
}

export async function consumeGuoyuTtsQuota(
  admin: SupabaseClient,
  parentId: string,
  parentMobile: string
): Promise<{
  ok: boolean;
  remaining: number;
  cap: number;
  is_paid_parent: boolean;
  is_tutor_parent: boolean;
  error?: string;
}> {
  const { data, error } = await admin.rpc("consume_parent_guoyu_tts_quota", {
    p_parent_id: parentId,
  });
  if (error) {
    const msg = String(error.message || "");
    const rpcMissing =
      msg.includes("consume_parent_guoyu_tts_quota") ||
      msg.includes("Could not find the function") ||
      error.code === "PGRST202";
    const fb = await resolveGuoyuOcrCapFallback(admin, parentId, parentMobile);
    if (rpcMissing) {
      return {
        ok: false,
        remaining: 0,
        cap: fb.cap,
        is_paid_parent: fb.is_paid_parent,
        is_tutor_parent: fb.is_tutor_parent,
        error: "tts_quota_rpc_not_deployed",
      };
    }
    return {
      ok: false,
      remaining: 0,
      cap: fb.cap,
      is_paid_parent: fb.is_paid_parent,
      is_tutor_parent: fb.is_tutor_parent,
      error: msg,
    };
  }
  const payload = data as RpcQuotaRow & { ok?: boolean; error?: string };
  const cap = Number(payload?.cap ?? GUOYU_FREE_OCR_CAP);
  return {
    ok: Boolean(payload?.ok),
    remaining: Number(payload?.remaining ?? 0),
    cap,
    is_paid_parent: Boolean(payload?.is_paid_parent ?? cap === GUOYU_PAID_OCR_CAP),
    is_tutor_parent: Boolean(payload?.is_tutor_parent),
    error: payload?.error,
  };
}

/** Client-facing quota view from API payload. */
export function mapGuoyuTtsQuotaToView(quota: GuoyuTtsQuotaStatus) {
  return {
    remaining: quota.remaining,
    cap: quota.cap,
    isPaidMit: quota.is_paid_parent,
    rpcReady: quota.rpc_ready,
  };
}

/** Mirrors OCR cap fallback for tests. */
export function computeGuoyuTtsCapFallback(params: {
  paidUntil: string | null;
  isTutorParent: boolean;
  now?: Date;
}): number {
  return computeGuoyuOcrCap(params);
}
