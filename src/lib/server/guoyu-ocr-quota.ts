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

export type GuoyuOcrQuotaStatus = {
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

function mapRpcQuotaRow(row: RpcQuotaRow | null, fallback: GuoyuOcrQuotaStatus): GuoyuOcrQuotaStatus {
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

export async function guoyuOcrParentIsTutor(
  admin: SupabaseClient,
  parentMobile: string
): Promise<boolean> {
  const mobile = parentMobile.trim();
  if (!mobile) return false;
  const { count, error } = await admin
    .from("tutor_referral_codes")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("tutor_mobile", mobile);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** Fallback cap when RPC not deployed — mirrors SQL (paid_until + tutor, not client is_paid). */
export async function resolveGuoyuOcrCapFallback(
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

export async function readGuoyuOcrQuota(
  admin: SupabaseClient,
  parentId: string,
  parentMobile: string
): Promise<GuoyuOcrQuotaStatus> {
  const hktMonth = getCurrentHktMonthKey();
  const fallbackMeta = await resolveGuoyuOcrCapFallback(admin, parentId, parentMobile);
  const fallback: GuoyuOcrQuotaStatus = {
    rpc_ready: false,
    remaining: fallbackMeta.cap,
    cap: fallbackMeta.cap,
    is_paid_parent: fallbackMeta.is_paid_parent,
    is_tutor_parent: fallbackMeta.is_tutor_parent,
    hkt_month: hktMonth,
    usage_count: 0,
  };

  const { data, error } = await admin.rpc("get_parent_guoyu_ocr_quota", {
    p_parent_id: parentId,
  });

  if (error) {
    const msg = String(error.message || "");
    const rpcMissing =
      msg.includes("get_parent_guoyu_ocr_quota") ||
      msg.includes("Could not find the function") ||
      error.code === "PGRST202";
    if (rpcMissing) {
      return fallback;
    }
    throw new Error(msg || "查詢 OCR 額度失敗");
  }

  return mapRpcQuotaRow(data as RpcQuotaRow, fallback);
}

export async function consumeGuoyuOcrQuota(
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
  const { data, error } = await admin.rpc("consume_parent_guoyu_ocr_quota", {
    p_parent_id: parentId,
  });
  if (error) {
    const msg = String(error.message || "");
    const rpcMissing =
      msg.includes("consume_parent_guoyu_ocr_quota") ||
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
        error: "ocr_quota_rpc_not_deployed",
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

export async function resolveStudentParent(
  admin: SupabaseClient,
  studentId: string
): Promise<{ parentId: string; mobile: string } | null> {
  const { data: student, error: stErr } = await admin
    .from("students")
    .select("parent_id")
    .eq("id", studentId)
    .maybeSingle();
  if (stErr || !student?.parent_id) return null;

  const { data: parent, error: pErr } = await admin
    .from("parents")
    .select("id,mobile_number")
    .eq("id", student.parent_id)
    .maybeSingle();
  if (pErr || !parent?.id || !parent.mobile_number) return null;

  return { parentId: parent.id, mobile: String(parent.mobile_number).trim() };
}
