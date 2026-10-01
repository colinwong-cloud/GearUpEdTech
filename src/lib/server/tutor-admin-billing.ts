import type { SupabaseClient } from "@supabase/supabase-js";
import { getAirwallexAccessToken } from "@/lib/server/payment-finalize";
import { getTutorAirwallexBaseUrl } from "@/lib/server/tutor-billing";
import { tutorGrantPaidUntil } from "@/lib/tutor-billing";
import { tutorComparisonUnlocked } from "@/lib/tutor-student-comparison";

export const TUTOR_PAYMENT_ADMIN_SQL_HINT =
  "缺少教師退款資料表，請先在 Supabase 執行 supabase_tutor_payment_admin.sql。";

const REFUND_SUCCESS_STATUSES = new Set(["RECEIVED", "ACCEPTED", "SETTLED"]);
const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;

function hktParts(date = new Date()) {
  const shifted = new Date(date.getTime() + HKT_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

export function hktMonthKey(date = new Date()): string {
  const { year, month } = hktParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function hktMonthRange(monthKey: string): { startIso: string; endIso: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  const startMs = Date.UTC(year, month - 1, 1) - HKT_OFFSET_MS;
  const endMs = Date.UTC(year, month, 1) - HKT_OFFSET_MS;
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

function hktDayRange(date = new Date()) {
  const { year, month, day } = hktParts(date);
  const startMs = Date.UTC(year, month, day) - HKT_OFFSET_MS;
  return {
    dayKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function monthDays(monthKey: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}

function hktDayKey(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const { year, month, day } = hktParts(new Date(time));
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type TutorCodeRow = {
  id: string;
  code: string;
  tutor_name: string | null;
  tutor_mobile: string | null;
  tutor_email: string | null;
  is_active: boolean | null;
  paid_until: string | null;
};

type RecurringRow = {
  id: string;
  code_id: string;
  status: string | null;
  next_charge_at: string | null;
  last_charged_at: string | null;
  last_error: string | null;
  airwallex_payment_consent_id: string | null;
  recurring_amount_hkd: number | null;
};

type OrderRow = {
  id: string;
  code_id: string;
  merchant_order_id: string | null;
  amount_hkd: number | null;
  status: string | null;
  created_at: string | null;
  paid_at: string | null;
  airwallex_payment_intent_id: string | null;
  payment_method_type: string | null;
};

function isMissingRefundTable(message: string): boolean {
  return /tutor_payment_refunds|42P01|does not exist/i.test(message);
}

async function findTutor(admin: SupabaseClient, query: string): Promise<TutorCodeRow | null> {
  const value = query.trim();
  let request = admin
    .from("tutor_referral_codes")
    .select("id,code,tutor_name,tutor_mobile,tutor_email,is_active,paid_until")
    .eq("is_active", true);
  if (/^\d{8}$/.test(value)) request = request.eq("tutor_mobile", value);
  else if (/^\d{6}$/.test(value)) request = request.eq("code", value);
  else return null;
  const res = await request.limit(1).maybeSingle();
  if (res.error) throw res.error;
  return (res.data as TutorCodeRow | null) ?? null;
}

async function loadRecurring(admin: SupabaseClient, codeId: string): Promise<RecurringRow | null> {
  const res = await admin
    .from("tutor_recurring_profiles")
    .select("id,code_id,status,next_charge_at,last_charged_at,last_error,airwallex_payment_consent_id,recurring_amount_hkd")
    .eq("code_id", codeId)
    .maybeSingle();
  if (res.error) {
    if (/tutor_recurring_profiles|42P01|does not exist/i.test(res.error.message || "")) return null;
    throw res.error;
  }
  return (res.data as RecurringRow | null) ?? null;
}

function recurringIsActive(profile: RecurringRow | null): boolean {
  return String(profile?.status ?? "").toLowerCase() === "active";
}

export async function enquireTutorPayment(admin: SupabaseClient, query: string) {
  const tutor = await findTutor(admin, query);
  if (!tutor) return { found: false as const };
  const recurring = await loadRecurring(admin, tutor.id);
  const ordersRes = await admin
    .from("tutor_payment_orders")
    .select("id,merchant_order_id,amount_hkd,status,created_at,paid_at,airwallex_payment_intent_id,payment_method_type")
    .eq("code_id", tutor.id)
    .order("created_at", { ascending: false })
    .limit(12);
  if (ordersRes.error && !/tutor_payment_orders|42P01|does not exist/i.test(ordersRes.error.message || "")) {
    throw ordersRes.error;
  }
  const paidUntil = tutor.paid_until ? String(tutor.paid_until) : null;
  return {
    found: true as const,
    tutor: {
      id: tutor.id,
      code: tutor.code,
      name: tutor.tutor_name || "",
      mobile: tutor.tutor_mobile || "",
      email: tutor.tutor_email || "",
      paid_until: paidUntil,
      active: tutorComparisonUnlocked(paidUntil),
      recurring_active: recurringIsActive(recurring),
    },
    recurring: recurring
      ? {
          status: recurring.status,
          next_charge_at: recurring.next_charge_at,
          last_charged_at: recurring.last_charged_at,
          last_error: recurring.last_error,
          amount_hkd: Number(recurring.recurring_amount_hkd ?? 199),
        }
      : null,
    orders: ((ordersRes.data as OrderRow[] | null) ?? []).map((order) => ({
      id: order.id,
      merchant_order_id: order.merchant_order_id,
      amount_hkd: Number(order.amount_hkd ?? 0),
      status: order.status,
      created_at: order.created_at,
      paid_at: order.paid_at,
      payment_method_type: order.payment_method_type,
    })),
  };
}

export async function tutorPaymentMonitor(admin: SupabaseClient, monthKey: string) {
  const range = hktMonthRange(monthKey);
  if (!range) throw new Error("月份格式必須為 YYYY-MM");
  const today = hktDayRange();
  const profilesRes = await admin
    .from("tutor_recurring_profiles")
    .select("id,code_id,status,next_charge_at,last_charged_at,last_error")
    .limit(2000);
  if (profilesRes.error && !/tutor_recurring_profiles|42P01|does not exist/i.test(profilesRes.error.message || "")) {
    throw profilesRes.error;
  }
  const profiles = (profilesRes.data as RecurringRow[] | null) ?? [];
  const ordersRes = await admin
    .from("tutor_payment_orders")
    .select("id,code_id,merchant_order_id,amount_hkd,status,created_at,paid_at")
    .gte("created_at", range.startIso)
    .lt("created_at", range.endIso)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (ordersRes.error && !/tutor_payment_orders|42P01|does not exist/i.test(ordersRes.error.message || "")) {
    throw ordersRes.error;
  }
  const orders = ((ordersRes.data as OrderRow[] | null) ?? []).filter((order) =>
    String(order.merchant_order_id ?? "").startsWith("tutor-renew-")
  );
  const tally = (dayKey: string) => {
    const dayOrders = orders.filter((order) => hktDayKey(order.created_at) === dayKey);
    return {
      day: dayKey,
      due: profiles.filter(
        (profile) => recurringIsActive(profile) && hktDayKey(profile.next_charge_at) === dayKey
      ).length,
      initiated: dayOrders.length,
      success: dayOrders.filter((order) => order.status === "paid").length,
      failed: dayOrders.filter((order) => order.status === "failed").length,
      amount_hkd: dayOrders
        .filter((order) => order.status === "paid")
        .reduce((sum, order) => sum + Number(order.amount_hkd ?? 0), 0),
    };
  };
  const days = monthDays(monthKey).map(tally);
  const todayRow = tally(today.dayKey);
  return {
    month: monthKey,
    today: todayRow,
    days,
    active_profiles: profiles.filter((profile) => recurringIsActive(profile)).length,
  };
}

export async function grantTutorPaid30Days(admin: SupabaseClient, mobile: string) {
  if (!/^\d{8}$/.test(mobile.trim())) throw new Error("請輸入 8 位數字教師手機");
  const tutor = await findTutor(admin, mobile.trim());
  if (!tutor) throw new Error("找不到此教師手機");
  const recurring = await loadRecurring(admin, tutor.id);
  if (recurringIsActive(recurring)) {
    throw new Error("此教師已有生效中的自動續費，不會改寫付款到期日。");
  }
  const paidUntil = tutorGrantPaidUntil();
  const update = await admin.from("tutor_referral_codes").update({ paid_until: paidUntil }).eq("id", tutor.id);
  if (update.error) throw update.error;
  return {
    code: tutor.code,
    name: tutor.tutor_name || "",
    mobile: tutor.tutor_mobile || mobile.trim(),
    paid_until: paidUntil,
  };
}

async function currentMonthPaidOrder(admin: SupabaseClient, codeId: string): Promise<OrderRow | null> {
  const range = hktMonthRange(hktMonthKey());
  if (!range) return null;
  const res = await admin
    .from("tutor_payment_orders")
    .select("id,code_id,merchant_order_id,amount_hkd,status,created_at,paid_at,airwallex_payment_intent_id,payment_method_type")
    .eq("code_id", codeId)
    .eq("status", "paid")
    .gte("paid_at", range.startIso)
    .lt("paid_at", range.endIso)
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) throw res.error;
  return (res.data as OrderRow | null) ?? null;
}

export async function previewTutorMonthRefund(admin: SupabaseClient, mobile: string) {
  if (!/^\d{8}$/.test(mobile.trim())) throw new Error("請輸入 8 位數字教師手機");
  const tutor = await findTutor(admin, mobile.trim());
  if (!tutor) return { found: false as const, reason: "找不到此教師手機" };
  const order = await currentMonthPaidOrder(admin, tutor.id);
  if (!order) return { found: true as const, order: null, reason: "本月沒有已付款的教師收費。" };
  return {
    found: true as const,
    order: {
      id: order.id,
      amount_hkd: Number(order.amount_hkd ?? 0),
      paid_at: order.paid_at,
      merchant_order_id: order.merchant_order_id,
    },
    tutor: { code: tutor.code, name: tutor.tutor_name || "", mobile: tutor.tutor_mobile || mobile.trim() },
    reason: "",
  };
}

async function readAirwallexBody(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export async function confirmTutorMonthRefund(
  admin: SupabaseClient,
  input: { mobile: string; orderId: string; reason: string; adminUser: string }
) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("請輸入退款原因");
  if (reason.length > 128) throw new Error("退款原因不可超過 128 字");
  const tutor = await findTutor(admin, input.mobile.trim());
  if (!tutor) throw new Error("找不到此教師手機");
  const order = await currentMonthPaidOrder(admin, tutor.id);
  if (!order || order.id !== input.orderId) throw new Error("只可退款本月已付款的一筆，請重新查詢。");
  const amount = Number(order.amount_hkd ?? 0);
  if (!(amount > 0)) throw new Error("退款金額無效");
  const intentId = String(order.airwallex_payment_intent_id ?? "").trim();
  if (!intentId) throw new Error("找不到 Airwallex 付款參考，不能退款。");

  const existing = await admin
    .from("tutor_payment_refunds")
    .select("id,status")
    .eq("payment_order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    if (isMissingRefundTable(existing.error.message || "")) throw new Error(TUTOR_PAYMENT_ADMIN_SQL_HINT);
    throw existing.error;
  }
  if (existing.data && String(existing.data.status || "").toLowerCase() !== "failed") {
    throw new Error("此付款已提交退款，請勿重複操作。");
  }

  const requestId = crypto.randomUUID();
  const inserted = await admin
    .from("tutor_payment_refunds")
    .insert({
      payment_order_id: order.id,
      code_id: tutor.id,
      tutor_mobile: tutor.tutor_mobile || input.mobile.trim(),
      admin_user: input.adminUser,
      reason,
      amount_hkd: amount,
      currency: "HKD",
      airwallex_request_id: requestId,
      airwallex_payment_intent_id: intentId,
      status: "initiated",
    })
    .select("id")
    .limit(1);
  if (inserted.error) {
    if (isMissingRefundTable(inserted.error.message || "")) throw new Error(TUTOR_PAYMENT_ADMIN_SQL_HINT);
    throw inserted.error;
  }
  const refundRowId = String(inserted.data?.[0]?.id ?? "");
  const baseUrl = getTutorAirwallexBaseUrl();
  const accessToken = await getAirwallexAccessToken(baseUrl);
  const refundRes = await fetch(`${baseUrl}/api/v1/pa/refunds/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      request_id: requestId,
      reason,
      amount,
      payment_intent_id: intentId,
    }),
    cache: "no-store",
  });
  const refundBody = await readAirwallexBody(refundRes);
  if (!refundRes.ok) {
    const failure = `Airwallex refunds/create failed (${refundRes.status})`;
    await admin.from("tutor_payment_refunds").update({
      status: "failed",
      failure_message: failure,
      raw_response: refundBody,
      updated_at: new Date().toISOString(),
    }).eq("id", refundRowId);
    throw new Error(failure);
  }
  const refundStatus = String(refundBody.status ?? "RECEIVED").toUpperCase();
  if (!REFUND_SUCCESS_STATUSES.has(refundStatus)) {
    await admin.from("tutor_payment_refunds").update({
      status: "failed",
      airwallex_refund_id: refundBody.id ? String(refundBody.id) : null,
      failure_message: `退款未成功（狀態：${refundStatus}）`,
      raw_response: refundBody,
      updated_at: new Date().toISOString(),
    }).eq("id", refundRowId);
    throw new Error(`退款未成功（狀態：${refundStatus}）`);
  }
  await admin.from("tutor_payment_refunds").update({
    status: refundStatus.toLowerCase(),
    airwallex_refund_id: refundBody.id ? String(refundBody.id) : null,
    raw_response: refundBody,
    updated_at: new Date().toISOString(),
  }).eq("id", refundRowId);

  const recurring = await loadRecurring(admin, tutor.id);
  if (recurring?.airwallex_payment_consent_id && recurringIsActive(recurring)) {
    await fetch(
      `${baseUrl}/api/v1/pa/payment_consents/${encodeURIComponent(recurring.airwallex_payment_consent_id)}/disable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ request_id: crypto.randomUUID() }),
        cache: "no-store",
      }
    );
  }
  if (recurring) {
    await admin.from("tutor_recurring_profiles").update({
      status: "cancelled",
      last_error: "管理員已退款並停止續費",
      updated_at: new Date().toISOString(),
    }).eq("id", recurring.id);
  }
  const stoppedAt = new Date().toISOString();
  await admin.from("tutor_referral_codes").update({ paid_until: stoppedAt }).eq("id", tutor.id);
  return {
    refund_id: refundBody.id ? String(refundBody.id) : null,
    refund_status: refundStatus,
    refund_amount_hkd: amount,
    paid_until: stoppedAt,
  };
}
