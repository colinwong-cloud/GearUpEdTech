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
import { resolveGuoyuOcrCapFallback, guoyuOcrParentIsTutor } from "@/lib/server/guoyu-ocr-quota";

export type ZhongwenXiezuoQuotaStatus = {
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

function mapRpcQuotaRow(row: RpcQuotaRow | null, fallback: ZhongwenXiezuoQuotaStatus): ZhongwenXiezuoQuotaStatus {
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

export async function readZhongwenXiezuoQuota(
  admin: SupabaseClient,
  parentId: string,
  parentMobile: string
): Promise<ZhongwenXiezuoQuotaStatus> {
  const hktMonth = getCurrentHktMonthKey();
  const fallbackMeta = await resolveGuoyuOcrCapFallback(admin, parentId, parentMobile);
  const fallback: ZhongwenXiezuoQuotaStatus = {
    rpc_ready: false,
    remaining: fallbackMeta.cap,
    cap: fallbackMeta.cap,
    is_paid_parent: fallbackMeta.is_paid_parent,
    is_tutor_parent: fallbackMeta.is_tutor_parent,
    hkt_month: hktMonth,
    usage_count: 0,
  };

  const { data, error } = await admin.rpc("get_parent_zhongwen_xiezuo_quota", {
    p_parent_id: parentId,
  });

  if (error) {
    const msg = String(error.message || "");
    const rpcMissing =
      msg.includes("get_parent_zhongwen_xiezuo_quota") ||
      msg.includes("Could not find the function") ||
      error.code === "PGRST202";
    if (rpcMissing) {
      return fallback;
    }
    throw new Error(msg || "查詢中文寫作額度失敗");
  }

  return mapRpcQuotaRow(data as RpcQuotaRow, fallback);
}

export async function consumeZhongwenXiezuoQuota(
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
  const { data, error } = await admin.rpc("consume_parent_zhongwen_xiezuo_quota", {
    p_parent_id: parentId,
  });
  if (error) {
    const msg = String(error.message || "");
    const rpcMissing =
      msg.includes("consume_parent_zhongwen_xiezuo_quota") ||
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
        error: "xiezuo_quota_rpc_not_deployed",
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

export { guoyuOcrParentIsTutor, resolveStudentParent } from "@/lib/server/guoyu-ocr-quota";

export async function resolveZhongwenXiezuoCapFallback(
  admin: SupabaseClient,
  parentId: string,
  parentMobile: string
): Promise<{ cap: number; is_paid_parent: boolean; is_tutor_parent: boolean }> {
  const isTutorParent = await guoyuOcrParentIsTutor(admin, parentMobile);
  const { data: parentRow } = await admin
    .from("parents")
    .select("paid_until")
    .eq("id", parentId)
    .maybeSingle();
  const paidUntil = parentRow?.paid_until ? String(parentRow.paid_until) : null;
  const cap = computeGuoyuOcrCap({ paidUntil, isTutorParent });
  return {
    cap,
    is_paid_parent: cap === GUOYU_PAID_OCR_CAP,
    is_tutor_parent: isTutorParent,
  };
}
