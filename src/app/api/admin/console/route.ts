import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";
import {
  getAirwallexAccessToken,
  getAirwallexBaseUrl,
} from "@/lib/server/payment-finalize";
import {
  getCurrentHktMonthKey,
  getHktMonthRangeIso,
  isValidMonthKey,
} from "@/lib/admin-paid-summary";

type AdminAction =
  | "search_parent"
  | "add_quota"
  | "delete_parent"
  | "get_settings"
  | "set_setting"
  | "set_email_notification"
  | "search_questions"
  | "update_question"
  | "discount_code_list"
  | "discount_code_create"
  | "discount_code_update"
  | "discount_code_delete"
  | "discount_code_usage_summary"
  | "payment_status_enquiry"
  | "payment_monthly_paid_summary"
  | "payment_cancel_future_payment"
  | "payment_refund_last_preview"
  | "payment_refund_last_confirm";

type RequestBody = {
  action?: AdminAction;
  payload?: Record<string, unknown>;
};

const DISCOUNT_CODE_RE = /^[A-Za-z0-9]{6}$/;
const RECURRING_ACTIVE_STATUSES = new Set(["active", "paused"]);
const REFUND_SUCCESS_STATUSES = new Set(["RECEIVED", "ACCEPTED", "SETTLED"]);
const PAYMENT_OPS_TABLE_HINT =
  "缺少付款管理資料表，請先在 Supabase 執行 supabase_admin_payment_ops.sql。";

function normalizeIsoDateTime(raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildLast12MonthsTemplate(now = new Date()): {
  month: string;
  amount_hkd: number;
  paid_count: number;
}[] {
  const result: { month: string; amount_hkd: number; paid_count: number }[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    result.push({ month, amount_hkd: 0, paid_count: 0 });
  }
  return result;
}

function toMonthKey(rawIso: string | null): string | null {
  if (!rawIso) return null;
  const date = new Date(rawIso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toSafeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function normalizeMethodToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function formatPaymentMethodDisplay({
  methodLabel,
  methodType,
  methodBrand,
  fallback,
}: {
  methodLabel: string | null;
  methodType: string | null;
  methodBrand: string | null;
  fallback: string | null;
}): string | null {
  const token =
    normalizeMethodToken(methodLabel) ||
    normalizeMethodToken(methodType) ||
    normalizeMethodToken(fallback);
  const brand = normalizeMethodToken(methodBrand);

  if (!token) return null;

  if (token === "applepay" || token === "apple pay") return "Apple Pay";
  if (token === "googlepay" || token === "google pay") return "Google Pay";
  if (token === "alipayhk" || token === "alipay_hk" || token === "alipay hk") return "Alipay HK";
  if (token === "wechatpay" || token === "wechat_pay" || token === "wechat pay hk") return "WeChat Pay HK";
  if (token === "visa") return "Card (Visa)";
  if (token === "mastercard" || token === "master card") return "Card (Mastercard)";
  if (token === "card") {
    if (brand === "visa") return "Card (Visa)";
    if (brand === "mastercard" || brand === "master card") return "Card (Mastercard)";
    return "Card";
  }
  if (token === "fps") return "FPS";
  return token;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

type AirwallexApiBody = {
  json: Record<string, unknown> | null;
  text: string;
};

async function readAirwallexApiBody(res: Response): Promise<AirwallexApiBody> {
  const text = await res.text();
  if (!text) return { json: null, text: "" };
  try {
    return {
      json: JSON.parse(text) as Record<string, unknown>,
      text,
    };
  } catch {
    return { json: null, text };
  }
}

function formatAirwallexError({
  action,
  status,
  body,
}: {
  action: string;
  status: number;
  body: AirwallexApiBody;
}): string {
  const json = body.json || {};
  const code = typeof json.code === "string" ? json.code : "";
  const message = typeof json.message === "string" ? json.message : "";
  if (code || message) {
    return `Airwallex ${action} failed (${status})${code ? ` [${code}]` : ""}: ${message || "Unknown error"}`;
  }
  const snippet = body.text.replace(/\s+/g, " ").slice(0, 220);
  return `Airwallex ${action} failed (${status})${snippet ? `: ${snippet}` : ""}`;
}

function normalizeRefundStatus(status: string | null): string {
  const normalized = (status || "").trim().toUpperCase();
  if (!normalized) return "initiated";
  return normalized.toLowerCase();
}

function isMissingPaymentOpsTableError(message: string): boolean {
  return /parent_payment_refunds|admin_payment_actions|42P01|does not exist/i.test(message);
}

type AdminClient = ReturnType<typeof getAdminClient> extends infer T ? Exclude<T, null> : never;

type ParentRow = {
  id: string;
  mobile_number: string;
  parent_name: string | null;
  subscription_tier: string | null;
  paid_started_at: string | null;
  paid_until: string | null;
};

type RecurringProfileRow = {
  id: string;
  parent_id: string | null;
  status: string | null;
  airwallex_payment_consent_id: string | null;
  payment_method_label: string | null;
  payment_method_type: string | null;
  payment_method_brand: string | null;
};

type PaidOrderRow = {
  id: string;
  parent_id: string | null;
  mobile_number: string;
  merchant_order_id?: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  final_amount_hkd: number | string | null;
  payment_method: string | null;
  payment_method_label?: string | null;
  payment_method_type?: string | null;
  payment_method_brand?: string | null;
  is_recurring_payment?: boolean | null;
  airwallex_payment_intent_id?: string | null;
  airwallex_payment_attempt_id?: string | null;
};

async function ensurePaymentOpsTables(admin: AdminClient) {
  const { error: refundProbeErr } = await admin
    .from("parent_payment_refunds")
    .select("id")
    .limit(1);
  if (refundProbeErr && isMissingPaymentOpsTableError(refundProbeErr.message)) {
    throw new Error(PAYMENT_OPS_TABLE_HINT);
  }
  if (refundProbeErr) throw refundProbeErr;

  const { error: actionProbeErr } = await admin
    .from("admin_payment_actions")
    .select("id")
    .limit(1);
  if (actionProbeErr && isMissingPaymentOpsTableError(actionProbeErr.message)) {
    throw new Error(PAYMENT_OPS_TABLE_HINT);
  }
  if (actionProbeErr) throw actionProbeErr;
}

async function getParentByMobile(admin: AdminClient, mobile: string): Promise<ParentRow | null> {
  const { data, error } = await admin
    .from("parents")
    .select("id,mobile_number,parent_name,subscription_tier,paid_started_at,paid_until")
    .eq("mobile_number", mobile)
    .maybeSingle();
  if (error) throw error;
  return (data as ParentRow | null) ?? null;
}

async function getRecurringProfileByMobile(
  admin: AdminClient,
  mobile: string
): Promise<RecurringProfileRow | null> {
  const { data, error } = await admin
    .from("parent_recurring_profiles")
    .select(
      "id,parent_id,status,airwallex_payment_consent_id,payment_method_label,payment_method_type,payment_method_brand"
    )
    .eq("mobile_number", mobile)
    .maybeSingle();
  if (error) {
    if (isMissingPaymentOpsTableError(error.message)) return null;
    const recurringErrMsg = error.message || "";
    if (/parent_recurring_profiles|42P01|does not exist/i.test(recurringErrMsg)) {
      return null;
    }
    throw error;
  }
  return (data as RecurringProfileRow | null) ?? null;
}

async function getLatestPaidOrder(admin: AdminClient, mobile: string): Promise<PaidOrderRow | null> {
  const rich = await admin
    .from("parent_payment_orders")
    .select(
      "id,parent_id,mobile_number,status,paid_at,created_at,final_amount_hkd,payment_method,payment_method_label,payment_method_type,payment_method_brand,is_recurring_payment,airwallex_payment_intent_id,airwallex_payment_attempt_id"
    )
    .eq("mobile_number", mobile)
    .eq("status", "paid")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rich.error) {
    const msg = rich.error.message || "";
    if (
      /payment_method_label|payment_method_type|payment_method_brand|is_recurring_payment|airwallex_payment_attempt_id/i.test(
        msg
      )
    ) {
      const fallback = await admin
        .from("parent_payment_orders")
        .select(
          "id,parent_id,mobile_number,status,paid_at,created_at,final_amount_hkd,payment_method,airwallex_payment_intent_id"
        )
        .eq("mobile_number", mobile)
        .eq("status", "paid")
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      return (fallback.data as PaidOrderRow | null) ?? null;
    }
    throw rich.error;
  }
  return (rich.data as PaidOrderRow | null) ?? null;
}

async function logAdminPaymentAction({
  admin,
  actionType,
  status,
  adminUser,
  mobile,
  parentId,
  paymentOrderId,
  recurringProfileId,
  message,
  payload,
}: {
  admin: AdminClient;
  actionType: "cancel_future_payment" | "refund_last_payment";
  status: "success" | "failed";
  adminUser: string;
  mobile: string;
  parentId: string | null;
  paymentOrderId: string | null;
  recurringProfileId: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
}) {
  const { error } = await admin.from("admin_payment_actions").insert({
    action_type: actionType,
    status,
    admin_user: adminUser,
    mobile_number: mobile,
    parent_id: parentId,
    payment_order_id: paymentOrderId,
    recurring_profile_id: recurringProfileId,
    message,
    payload,
  });
  if (error) throw error;
}

async function disablePaymentConsent({
  consentId,
}: {
  consentId: string;
}): Promise<{ disabled: boolean; status: string | null }> {
  const baseUrl = getAirwallexBaseUrl();
  const accessToken = await getAirwallexAccessToken(baseUrl);
  const res = await fetch(
    `${baseUrl}/api/v1/pa/payment_consents/${encodeURIComponent(consentId)}/disable`,
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
  const body = await readAirwallexApiBody(res);
  if (!res.ok) {
    const code = readString(body.json?.code)?.toLowerCase() || "";
    const message = readString(body.json?.message)?.toLowerCase() || "";
    if (
      code === "invalid_status_for_operation" ||
      message.includes("disabled") ||
      message.includes("cannot be used")
    ) {
      return { disabled: true, status: "DISABLED" };
    }
    throw new Error(
      formatAirwallexError({
        action: "payment_consents/disable",
        status: res.status,
        body,
      })
    );
  }
  return {
    disabled: true,
    status: readString(body.json?.status),
  };
}

async function cancelRecurringLocally({
  admin,
  profileId,
}: {
  admin: AdminClient;
  profileId: string;
}) {
  const { error } = await admin
    .from("parent_recurring_profiles")
    .update({
      status: "cancelled",
      last_order_status: "cancelled",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
  if (error) throw error;
}

async function downgradeParentToFree({
  admin,
  parentId,
}: {
  admin: AdminClient;
  parentId: string;
}) {
  const downgradeAt = new Date(Date.now() - 1000).toISOString();
  const { error } = await admin
    .from("parents")
    .update({
      subscription_tier: "free",
      paid_until: downgradeAt,
    })
    .eq("id", parentId);
  if (error) throw error;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const adminSession = requireAdminSession(req);
  if (!adminSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminUser = adminSession.sub || "admin";

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel" },
      { status: 503 }
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  const payload = body.payload ?? {};
  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  try {
    switch (action) {
      case "search_parent": {
        const mobile = String(payload.p_mobile ?? "");
        const { data, error } = await admin.rpc("admin_search_parent", {
          p_mobile: mobile,
        });
        if (error) throw error;
        return NextResponse.json({ data: data ?? null });
      }
      case "add_quota": {
        const studentId = String(payload.p_student_id ?? "");
        const subject = String(payload.p_subject ?? "Math");
        const amount = Number(payload.p_amount ?? 0);
        const { data, error } = await admin.rpc("admin_add_quota", {
          p_student_id: studentId,
          p_subject: subject,
          p_amount: amount,
        });
        if (error) throw error;
        return NextResponse.json({ data });
      }
      case "delete_parent": {
        const mobile = String(payload.p_mobile ?? "");
        const { data, error } = await admin.rpc("admin_delete_parent", {
          p_mobile: mobile,
        });
        if (error) throw error;
        return NextResponse.json({ data });
      }
      case "get_settings": {
        const { data, error } = await admin.rpc("admin_get_settings");
        if (error) throw error;
        return NextResponse.json({ data: data ?? {} });
      }
      case "set_setting": {
        const key = String(payload.p_key ?? "");
        const value = String(payload.p_value ?? "");
        const { error } = await admin.rpc("admin_set_setting", {
          p_key: key,
          p_value: value,
        });
        if (error) throw error;
        return NextResponse.json({ data: { ok: true } });
      }
      case "set_email_notification": {
        const email = String(payload.p_email ?? "");
        const enabled = Boolean(payload.p_enabled);
        const { data, error } = await admin.rpc("admin_set_email_notification", {
          p_email: email,
          p_enabled: enabled,
        });
        if (error) throw error;
        return NextResponse.json({ data });
      }
      case "search_questions": {
        const query = String(payload.p_query ?? "");
        const { data, error } = await admin.rpc("admin_search_questions", {
          p_query: query,
        });
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }
      case "update_question": {
        const { error } = await admin.rpc("admin_update_question", {
          p_id: String(payload.p_id ?? ""),
          p_content: payload.p_content,
          p_opt_a: payload.p_opt_a,
          p_opt_b: payload.p_opt_b,
          p_opt_c: payload.p_opt_c,
          p_opt_d: payload.p_opt_d,
          p_correct_answer: payload.p_correct_answer,
          p_explanation: payload.p_explanation,
        });
        if (error) throw error;
        return NextResponse.json({ data: { ok: true } });
      }
      case "discount_code_list": {
        const q = String(payload.q ?? "").trim();
        let query = admin
          .from("discount_codes")
          .select("id,code,discount_percent,salesperson,is_active,created_at")
          .order("created_at", { ascending: false })
          .limit(500);
        if (q) {
          const safeQ = q.replace(/,/g, " ");
          query = query.or(`code.ilike.%${safeQ}%,salesperson.ilike.%${safeQ}%`);
        }
        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }
      case "discount_code_create": {
        const code = String(payload.code ?? "").trim().toUpperCase();
        const discountPercent = Number(payload.discount_percent ?? 0);
        const salesperson = String(payload.salesperson ?? "").trim();
        const isActive = payload.is_active === undefined ? true : Boolean(payload.is_active);
        const createdAt = normalizeIsoDateTime(payload.created_at);

        if (!DISCOUNT_CODE_RE.test(code)) {
          return NextResponse.json({ error: "折扣碼必須為 6 位英數字" }, { status: 400 });
        }
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
          return NextResponse.json({ error: "折扣百分比必須介乎 0 至 100" }, { status: 400 });
        }
        if (!salesperson) {
          return NextResponse.json({ error: "請輸入業務員名稱" }, { status: 400 });
        }
        if (payload.created_at !== undefined && payload.created_at !== null && !createdAt) {
          return NextResponse.json({ error: "建立時間格式無效" }, { status: 400 });
        }

        const insertPayload: Record<string, unknown> = {
          code,
          discount_percent: discountPercent,
          salesperson,
          is_active: isActive,
        };
        if (createdAt) insertPayload.created_at = createdAt;

        const { data, error } = await admin
          .from("discount_codes")
          .insert(insertPayload)
          .select("id,code,discount_percent,salesperson,is_active,created_at")
          .single();
        if (error) throw error;
        return NextResponse.json({ data });
      }
      case "discount_code_update": {
        const id = String(payload.id ?? "").trim();
        const code = String(payload.code ?? "").trim().toUpperCase();
        const discountPercent = Number(payload.discount_percent ?? 0);
        const salesperson = String(payload.salesperson ?? "").trim();
        const isActive = payload.is_active === undefined ? true : Boolean(payload.is_active);
        const createdAt = normalizeIsoDateTime(payload.created_at);

        if (!id) {
          return NextResponse.json({ error: "缺少折扣碼 ID" }, { status: 400 });
        }
        if (!DISCOUNT_CODE_RE.test(code)) {
          return NextResponse.json({ error: "折扣碼必須為 6 位英數字" }, { status: 400 });
        }
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
          return NextResponse.json({ error: "折扣百分比必須介乎 0 至 100" }, { status: 400 });
        }
        if (!salesperson) {
          return NextResponse.json({ error: "請輸入業務員名稱" }, { status: 400 });
        }
        if (payload.created_at !== undefined && payload.created_at !== null && !createdAt) {
          return NextResponse.json({ error: "建立時間格式無效" }, { status: 400 });
        }

        const updatePayload: Record<string, unknown> = {
          code,
          discount_percent: discountPercent,
          salesperson,
          is_active: isActive,
        };
        if (createdAt) updatePayload.created_at = createdAt;

        const { data, error } = await admin
          .from("discount_codes")
          .update(updatePayload)
          .eq("id", id)
          .select("id,code,discount_percent,salesperson,is_active,created_at")
          .single();
        if (error) throw error;
        return NextResponse.json({ data });
      }
      case "discount_code_delete": {
        const id = String(payload.id ?? "").trim();
        if (!id) {
          return NextResponse.json({ error: "缺少折扣碼 ID" }, { status: 400 });
        }
        const { error } = await admin.from("discount_codes").delete().eq("id", id);
        if (error) throw error;
        return NextResponse.json({ data: { ok: true } });
      }
      case "discount_code_usage_summary": {
        const month = String(payload.month ?? "").trim();
        const salespersonFilter = String(payload.salesperson ?? "").trim().toLowerCase();
        if (month && !/^\d{4}-\d{2}$/.test(month)) {
          return NextResponse.json({ error: "月份格式必須為 YYYY-MM" }, { status: 400 });
        }

        let usageQuery = admin
          .from("parent_payment_orders")
          .select(
            "id,created_at,paid_at,mobile_number,merchant_order_id,status,payment_method,discount_code,discount_percent,amount_hkd,final_amount_hkd"
          )
          .not("discount_code", "is", null)
          .neq("discount_code", "")
          .order("created_at", { ascending: false })
          .limit(10000);

        if (month) {
          const [y, m] = month.split("-").map((v) => Number(v));
          const start = new Date(Date.UTC(y, m - 1, 1));
          const end = new Date(Date.UTC(y, m, 1));
          usageQuery = usageQuery.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
        }

        const { data: usageRows, error: usageError } = await usageQuery;
        if (usageError) throw usageError;

        const { data: discountRows, error: discountError } = await admin
          .from("discount_codes")
          .select("code,salesperson");
        if (discountError) throw discountError;

        const salespersonByCode = new Map<string, string>();
        for (const row of discountRows ?? []) {
          salespersonByCode.set(String(row.code ?? "").toUpperCase(), String(row.salesperson ?? "").trim());
        }

        type UsageRecord = {
          id: string;
          usage_date: string;
          usage_month: string;
          created_at: string;
          paid_at: string | null;
          discount_code: string;
          salesperson: string | null;
          discount_percent: number;
          amount_hkd: number;
          final_amount_hkd: number;
          discount_amount_hkd: number;
          status: string;
          mobile_number: string;
          merchant_order_id: string;
          payment_method: string | null;
        };

        const records: UsageRecord[] = [];
        for (const row of usageRows ?? []) {
          const discountCode = String(row.discount_code ?? "").trim().toUpperCase();
          if (!discountCode) continue;
          const createdAtRaw = String(row.created_at ?? "");
          const createdAt = normalizeIsoDateTime(createdAtRaw);
          if (!createdAt) continue;
          const salesperson = salespersonByCode.get(discountCode) ?? null;
          if (salespersonFilter && (salesperson || "").toLowerCase() !== salespersonFilter) {
            continue;
          }
          const amount = Number(row.amount_hkd ?? 0);
          const finalAmount = Number(row.final_amount_hkd ?? 0);
          records.push({
            id: String(row.id ?? ""),
            usage_date: createdAt.slice(0, 10),
            usage_month: createdAt.slice(0, 7),
            created_at: createdAt,
            paid_at: normalizeIsoDateTime(row.paid_at),
            discount_code: discountCode,
            salesperson,
            discount_percent: Number(row.discount_percent ?? 0),
            amount_hkd: amount,
            final_amount_hkd: finalAmount,
            discount_amount_hkd: Math.max(amount - finalAmount, 0),
            status: String(row.status ?? ""),
            mobile_number: String(row.mobile_number ?? ""),
            merchant_order_id: String(row.merchant_order_id ?? ""),
            payment_method:
              row.payment_method === null || row.payment_method === undefined
                ? null
                : String(row.payment_method),
          });
        }

        const summaryMap = new Map<
          string,
          {
            usage_month: string;
            salesperson: string;
            usage_count: number;
            paid_count: number;
            gross_amount_hkd: number;
            final_amount_hkd: number;
            discount_amount_hkd: number;
          }
        >();
        for (const rec of records) {
          const salesperson = rec.salesperson || "未分配";
          const key = `${rec.usage_month}__${salesperson}`;
          const prev = summaryMap.get(key) ?? {
            usage_month: rec.usage_month,
            salesperson,
            usage_count: 0,
            paid_count: 0,
            gross_amount_hkd: 0,
            final_amount_hkd: 0,
            discount_amount_hkd: 0,
          };
          prev.usage_count += 1;
          const isPaid = rec.status.trim().toLowerCase() === "paid";
          if (isPaid) {
            prev.paid_count += 1;
            // Monetary totals should reflect successful payments only.
            prev.gross_amount_hkd += rec.amount_hkd;
            prev.final_amount_hkd += rec.final_amount_hkd;
            prev.discount_amount_hkd += rec.discount_amount_hkd;
          }
          summaryMap.set(key, prev);
        }

        const summary = Array.from(summaryMap.values()).sort((a, b) => {
          if (a.usage_month === b.usage_month) return a.salesperson.localeCompare(b.salesperson);
          return a.usage_month < b.usage_month ? 1 : -1;
        });

        const salespersons = Array.from(
          new Set(records.map((r) => r.salesperson).filter((v): v is string => Boolean(v && v.trim())))
        ).sort((a, b) => a.localeCompare(b));

        return NextResponse.json({
          data: {
            summary,
            records,
            salespersons,
          },
        });
      }
      case "payment_status_enquiry": {
        const mobile = String(payload.mobile_number ?? payload.p_mobile ?? "").trim();
        if (!mobile) {
          return NextResponse.json({ error: "請輸入電話號碼" }, { status: 400 });
        }

        const parent = await getParentByMobile(admin, mobile);

        if (!parent) {
          return NextResponse.json({ data: { found: false } });
        }

        const paidUntilIso = normalizeIsoDateTime(parent.paid_until);
        const isPaidNow =
          paidUntilIso !== null && new Date(paidUntilIso).getTime() >= Date.now();

        const recurringProfile = await getRecurringProfileByMobile(admin, mobile);

        const now = new Date();
        const historyStartIso = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
        ).toISOString();

        let paidOrders: PaidOrderRow[] = [];
        const richOrdersRes = await admin
          .from("parent_payment_orders")
          .select(
            "id,parent_id,mobile_number,status,paid_at,created_at,final_amount_hkd,payment_method,payment_method_label,payment_method_type,payment_method_brand,is_recurring_payment,airwallex_payment_intent_id,airwallex_payment_attempt_id"
          )
          .eq("mobile_number", mobile)
          .eq("status", "paid")
          .gte("created_at", historyStartIso)
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(500);
        if (richOrdersRes.error) {
          const ordersErrMsg = richOrdersRes.error.message || "";
          if (
            /payment_method_label|payment_method_type|payment_method_brand|is_recurring_payment/i.test(
              ordersErrMsg
            )
          ) {
            const fallbackOrdersRes = await admin
              .from("parent_payment_orders")
              .select(
                "id,parent_id,mobile_number,status,paid_at,created_at,final_amount_hkd,payment_method,airwallex_payment_intent_id"
              )
              .eq("mobile_number", mobile)
              .eq("status", "paid")
              .gte("created_at", historyStartIso)
              .order("paid_at", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false })
              .limit(500);
            if (fallbackOrdersRes.error) throw fallbackOrdersRes.error;
            paidOrders = (fallbackOrdersRes.data as PaidOrderRow[] | null) ?? [];
          } else {
            throw richOrdersRes.error;
          }
        } else {
          paidOrders = (richOrdersRes.data as PaidOrderRow[] | null) ?? [];
        }

        const latestPaidOrder = paidOrders[0] ?? null;
        const recurringStatus = recurringProfile?.status
          ? String(recurringProfile.status).toLowerCase()
          : null;
        const isRecurringFromProfile =
          recurringStatus !== null && RECURRING_ACTIVE_STATUSES.has(recurringStatus);
        const isRecurringFromLatestOrder = Boolean(latestPaidOrder?.is_recurring_payment);
        const isRecurring = isRecurringFromProfile || isRecurringFromLatestOrder;

        const billedByMonth = buildLast12MonthsTemplate(now);
        const monthLookup = new Map(billedByMonth.map((row) => [row.month, row]));
        for (const row of paidOrders) {
          const timeIso =
            normalizeIsoDateTime(row.paid_at) || normalizeIsoDateTime(row.created_at);
          const monthKey = toMonthKey(timeIso);
          if (!monthKey) continue;
          const bucket = monthLookup.get(monthKey);
          if (!bucket) continue;
          bucket.amount_hkd = Math.round((bucket.amount_hkd + toSafeNumber(row.final_amount_hkd)) * 100) / 100;
          bucket.paid_count += 1;
        }

        const billedTotal = Math.round(
          billedByMonth.reduce((sum, row) => sum + row.amount_hkd, 0) * 100
        ) / 100;
        const paymentMethod = formatPaymentMethodDisplay({
          methodLabel:
            recurringProfile?.payment_method_label ?? latestPaidOrder?.payment_method_label ?? null,
          methodType:
            recurringProfile?.payment_method_type ?? latestPaidOrder?.payment_method_type ?? null,
          methodBrand:
            recurringProfile?.payment_method_brand ?? latestPaidOrder?.payment_method_brand ?? null,
          fallback: latestPaidOrder?.payment_method ?? null,
        });

        let latestRefund: {
          status: string | null;
          amount_hkd: number;
          created_at: string | null;
          airwallex_refund_id: string | null;
        } | null = null;
        if (latestPaidOrder?.id) {
          const { data: refundData, error: refundErr } = await admin
            .from("parent_payment_refunds")
            .select("status,amount_hkd,created_at,airwallex_refund_id")
            .eq("payment_order_id", latestPaidOrder.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (refundErr) {
            if (!isMissingPaymentOpsTableError(refundErr.message)) {
              throw refundErr;
            }
          } else if (refundData) {
            latestRefund = {
              status: readString(refundData.status),
              amount_hkd: toSafeNumber(refundData.amount_hkd),
              created_at: normalizeIsoDateTime(refundData.created_at),
              airwallex_refund_id: readString(refundData.airwallex_refund_id),
            };
          }
        }

        return NextResponse.json({
          data: {
            found: true,
            parent: {
              id: parent.id,
              mobile_number: parent.mobile_number,
              parent_name: parent.parent_name,
              tier: isPaidNow ? "paid" : "free",
              is_paid: isPaidNow,
              paid_started_at: normalizeIsoDateTime(parent.paid_started_at),
              paid_until: paidUntilIso,
            },
            payment: isPaidNow
              ? {
                  current_payment_start_date: normalizeIsoDateTime(parent.paid_started_at),
                  current_payment_end_date: paidUntilIso,
                  payment_method: paymentMethod,
                  is_recurring: isRecurring,
                  recurring_status: recurringStatus,
                  billed_last_12_months_total_hkd: billedTotal,
                  billed_last_12_months_by_month: billedByMonth,
                  latest_paid_order: latestPaidOrder
                    ? {
                        id: latestPaidOrder.id,
                        paid_at:
                          normalizeIsoDateTime(latestPaidOrder.paid_at) ||
                          normalizeIsoDateTime(latestPaidOrder.created_at),
                        amount_hkd: toSafeNumber(latestPaidOrder.final_amount_hkd),
                        payment_method: paymentMethod,
                      }
                    : null,
                  latest_refund: latestRefund,
                }
              : null,
          },
        });
      }
      case "payment_monthly_paid_summary": {
        const requestedMonth = String(payload.month ?? "").trim();
        const monthKey = requestedMonth || getCurrentHktMonthKey();
        if (!isValidMonthKey(monthKey)) {
          return NextResponse.json({ error: "月份格式必須為 YYYY-MM" }, { status: 400 });
        }
        const { startIso, endIso } = getHktMonthRangeIso(monthKey);

        let paidOrders: PaidOrderRow[] = [];
        const richOrdersRes = await admin
          .from("parent_payment_orders")
          .select(
            "id,parent_id,mobile_number,merchant_order_id,status,paid_at,created_at,final_amount_hkd,payment_method,payment_method_label,payment_method_type,payment_method_brand,is_recurring_payment,airwallex_payment_intent_id,airwallex_payment_attempt_id"
          )
          .eq("status", "paid")
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .not("mobile_number", "like", "9999%")
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(20000);
        if (richOrdersRes.error) {
          const ordersErrMsg = richOrdersRes.error.message || "";
          if (
            /payment_method_label|payment_method_type|payment_method_brand|is_recurring_payment|airwallex_payment_attempt_id|merchant_order_id/i.test(
              ordersErrMsg
            )
          ) {
            const fallbackOrdersRes = await admin
              .from("parent_payment_orders")
              .select(
                "id,parent_id,mobile_number,merchant_order_id,status,paid_at,created_at,final_amount_hkd,payment_method,airwallex_payment_intent_id"
              )
              .eq("status", "paid")
              .gte("created_at", startIso)
              .lt("created_at", endIso)
              .not("mobile_number", "like", "9999%")
              .order("paid_at", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false })
              .limit(20000);
            if (fallbackOrdersRes.error) throw fallbackOrdersRes.error;
            paidOrders = (fallbackOrdersRes.data as PaidOrderRow[] | null) ?? [];
          } else {
            throw richOrdersRes.error;
          }
        } else {
          paidOrders = (richOrdersRes.data as PaidOrderRow[] | null) ?? [];
        }

        const paidMobiles = Array.from(
          new Set(paidOrders.map((row) => String(row.mobile_number || "").trim()).filter(Boolean))
        );
        const parentByMobile = new Map<
          string,
          { id: string; mobile_number: string; parent_name: string | null; paid_started_at: string | null }
        >();
        for (const chunk of chunkArray(paidMobiles, 500)) {
          const { data: parentRows, error: parentErr } = await admin
            .from("parents")
            .select("id,mobile_number,parent_name,paid_started_at")
            .in("mobile_number", chunk)
            .not("mobile_number", "like", "9999%");
          if (parentErr) throw parentErr;
          for (const row of parentRows ?? []) {
            parentByMobile.set(String(row.mobile_number), {
              id: String(row.id),
              mobile_number: String(row.mobile_number),
              parent_name:
                row.parent_name === null || row.parent_name === undefined
                  ? null
                  : String(row.parent_name),
              paid_started_at: normalizeIsoDateTime(row.paid_started_at),
            });
          }
        }

        const { data: paidStartedRows, error: paidStartedErr } = await admin
          .from("parents")
          .select("id,mobile_number,parent_name,paid_started_at")
          .not("paid_started_at", "is", null)
          .gte("paid_started_at", startIso)
          .lt("paid_started_at", endIso)
          .not("mobile_number", "like", "9999%")
          .order("paid_started_at", { ascending: false })
          .limit(10000);
        if (paidStartedErr) throw paidStartedErr;

        const ordersByMobile = new Map<string, PaidOrderRow[]>();
        for (const order of paidOrders) {
          const mobile = String(order.mobile_number || "").trim();
          if (!mobile) continue;
          const group = ordersByMobile.get(mobile) ?? [];
          group.push(order);
          ordersByMobile.set(mobile, group);
        }
        for (const orders of ordersByMobile.values()) {
          orders.sort((a, b) => {
            const aTime =
              normalizeIsoDateTime(a.paid_at) || normalizeIsoDateTime(a.created_at) || "";
            const bTime =
              normalizeIsoDateTime(b.paid_at) || normalizeIsoDateTime(b.created_at) || "";
            return bTime.localeCompare(aTime);
          });
        }

        const parentRows = (paidStartedRows ?? []).map((row) => {
          const mobile = String(row.mobile_number || "").trim();
          const orders = ordersByMobile.get(mobile) ?? [];
          const monthlyAmount = Math.round(
            orders.reduce((sum, item) => sum + toSafeNumber(item.final_amount_hkd), 0) * 100
          ) / 100;
          const latestOrder = orders[0] ?? null;
          const latestPaymentMethod = latestOrder
            ? formatPaymentMethodDisplay({
                methodLabel: latestOrder.payment_method_label ?? null,
                methodType: latestOrder.payment_method_type ?? null,
                methodBrand: latestOrder.payment_method_brand ?? null,
                fallback: latestOrder.payment_method ?? null,
              })
            : null;

          return {
            parent_id: String(row.id),
            mobile_number: mobile,
            parent_name:
              row.parent_name === null || row.parent_name === undefined
                ? null
                : String(row.parent_name),
            paid_started_at: normalizeIsoDateTime(row.paid_started_at),
            monthly_paid_count: orders.length,
            monthly_paid_amount_hkd: monthlyAmount,
            latest_paid_at: latestOrder
              ? normalizeIsoDateTime(latestOrder.paid_at) ||
                normalizeIsoDateTime(latestOrder.created_at)
              : null,
            latest_payment_method: latestPaymentMethod,
          };
        });

        const records = paidOrders.map((order) => {
          const mobile = String(order.mobile_number || "").trim();
          const parentMeta = parentByMobile.get(mobile);
          const paymentMethod = formatPaymentMethodDisplay({
            methodLabel: order.payment_method_label ?? null,
            methodType: order.payment_method_type ?? null,
            methodBrand: order.payment_method_brand ?? null,
            fallback: order.payment_method ?? null,
          });

          return {
            id: String(order.id),
            mobile_number: mobile,
            parent_name: parentMeta?.parent_name ?? null,
            merchant_order_id: String(order.merchant_order_id ?? ""),
            status: String(order.status ?? ""),
            paid_at:
              normalizeIsoDateTime(order.paid_at) || normalizeIsoDateTime(order.created_at),
            created_at: normalizeIsoDateTime(order.created_at) || "",
            final_amount_hkd: toSafeNumber(order.final_amount_hkd),
            payment_method: paymentMethod,
            is_recurring_payment: Boolean(order.is_recurring_payment),
            airwallex_payment_intent_id: readString(order.airwallex_payment_intent_id),
            airwallex_payment_attempt_id: readString(order.airwallex_payment_attempt_id),
          };
        });

        const totalPaidAmountHkd = Math.round(
          records.reduce((sum, row) => sum + toSafeNumber(row.final_amount_hkd), 0) * 100
        ) / 100;
        const totalNewPaidAmountHkd = Math.round(
          parentRows.reduce((sum, row) => sum + toSafeNumber(row.monthly_paid_amount_hkd), 0) * 100
        ) / 100;

        return NextResponse.json({
          data: {
            month: monthKey,
            totals: {
              new_paid_parents: parentRows.length,
              new_paid_parents_amount_hkd: totalNewPaidAmountHkd,
              paid_transactions: records.length,
              paid_amount_hkd: totalPaidAmountHkd,
            },
            parents: parentRows,
            records,
          },
        });
      }
      case "payment_cancel_future_payment": {
        await ensurePaymentOpsTables(admin);
        const mobile = String(payload.mobile_number ?? payload.p_mobile ?? "").trim();
        if (!mobile) {
          return NextResponse.json({ error: "請輸入電話號碼" }, { status: 400 });
        }
        const parent = await getParentByMobile(admin, mobile);
        if (!parent) {
          return NextResponse.json({ error: "找不到此電話號碼" }, { status: 404 });
        }
        const recurringProfile = await getRecurringProfileByMobile(admin, mobile);
        if (!recurringProfile) {
          return NextResponse.json({ error: "此家長沒有可取消的續費設定" }, { status: 400 });
        }

        let consentDisabled = false;
        let consentStatus: string | null = null;
        try {
          if (
            recurringProfile.airwallex_payment_consent_id &&
            String(recurringProfile.status || "").toLowerCase() !== "cancelled"
          ) {
            const disabledResult = await disablePaymentConsent({
              consentId: recurringProfile.airwallex_payment_consent_id,
            });
            consentDisabled = disabledResult.disabled;
            consentStatus = disabledResult.status;
          }

          if (String(recurringProfile.status || "").toLowerCase() !== "cancelled") {
            await cancelRecurringLocally({
              admin,
              profileId: recurringProfile.id,
            });
          }

          await logAdminPaymentAction({
            admin,
            actionType: "cancel_future_payment",
            status: "success",
            adminUser,
            mobile,
            parentId: parent.id,
            paymentOrderId: null,
            recurringProfileId: recurringProfile.id,
            message: "Recurring payment cancelled by admin",
            payload: {
              consent_disabled: consentDisabled,
              consent_status: consentStatus,
              previous_status: recurringProfile.status,
            },
          });

          return NextResponse.json({
            data: {
              ok: true,
              consent_disabled: consentDisabled,
              consent_status: consentStatus,
              recurring_status: "cancelled",
              message: "已取消未來續費",
            },
          });
        } catch (actionErr) {
          await logAdminPaymentAction({
            admin,
            actionType: "cancel_future_payment",
            status: "failed",
            adminUser,
            mobile,
            parentId: parent.id,
            paymentOrderId: null,
            recurringProfileId: recurringProfile.id,
            message: actionErr instanceof Error ? actionErr.message : "Unknown error",
            payload: {
              previous_status: recurringProfile.status,
            },
          });
          throw actionErr;
        }
      }
      case "payment_refund_last_preview": {
        await ensurePaymentOpsTables(admin);
        const mobile = String(payload.mobile_number ?? payload.p_mobile ?? "").trim();
        if (!mobile) {
          return NextResponse.json({ error: "請輸入電話號碼" }, { status: 400 });
        }
        const parent = await getParentByMobile(admin, mobile);
        if (!parent) {
          return NextResponse.json({ data: { found: false } });
        }

        const latestOrder = await getLatestPaidOrder(admin, mobile);
        if (!latestOrder) {
          return NextResponse.json({
            data: {
              found: true,
              eligible: false,
              reason: "找不到可退款的最近付款記錄",
            },
          });
        }

        const { data: existingRefund, error: existingRefundErr } = await admin
          .from("parent_payment_refunds")
          .select("id,status,amount_hkd,created_at,airwallex_refund_id")
          .eq("payment_order_id", latestOrder.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingRefundErr) {
          if (isMissingPaymentOpsTableError(existingRefundErr.message)) {
            throw new Error(PAYMENT_OPS_TABLE_HINT);
          }
          throw existingRefundErr;
        }

        const paymentMethod = formatPaymentMethodDisplay({
          methodLabel: latestOrder.payment_method_label ?? null,
          methodType: latestOrder.payment_method_type ?? null,
          methodBrand: latestOrder.payment_method_brand ?? null,
          fallback: latestOrder.payment_method ?? null,
        });

        const existingStatus = readString(existingRefund?.status);
        const canRetryFailed = existingStatus === "failed";
        const eligible = !existingRefund || canRetryFailed;

        return NextResponse.json({
          data: {
            found: true,
            eligible,
            reason: eligible ? null : "最近一筆付款已提交退款，不能重複退款",
            parent: {
              id: parent.id,
              mobile_number: parent.mobile_number,
              parent_name: parent.parent_name,
            },
            order: {
              id: latestOrder.id,
              paid_at:
                normalizeIsoDateTime(latestOrder.paid_at) ||
                normalizeIsoDateTime(latestOrder.created_at),
              amount_hkd: toSafeNumber(latestOrder.final_amount_hkd),
              currency: "HKD",
              payment_method: paymentMethod,
            },
            existing_refund: existingRefund
              ? {
                  id: existingRefund.id,
                  status: existingStatus,
                  amount_hkd: toSafeNumber(existingRefund.amount_hkd),
                  created_at: normalizeIsoDateTime(existingRefund.created_at),
                  airwallex_refund_id: readString(existingRefund.airwallex_refund_id),
                }
              : null,
          },
        });
      }
      case "payment_refund_last_confirm": {
        await ensurePaymentOpsTables(admin);
        const mobile = String(payload.mobile_number ?? payload.p_mobile ?? "").trim();
        const orderId = String(payload.order_id ?? "").trim();
        const reason = String(payload.reason ?? "").trim();

        if (!mobile) {
          return NextResponse.json({ error: "請輸入電話號碼" }, { status: 400 });
        }
        if (!orderId) {
          return NextResponse.json({ error: "缺少付款記錄 ID" }, { status: 400 });
        }
        if (!reason) {
          return NextResponse.json({ error: "請輸入退款原因" }, { status: 400 });
        }
        if (reason.length > 128) {
          return NextResponse.json({ error: "退款原因不可超過 128 字" }, { status: 400 });
        }

        const parent = await getParentByMobile(admin, mobile);
        if (!parent) {
          return NextResponse.json({ error: "找不到此電話號碼" }, { status: 404 });
        }

        const latestOrder = await getLatestPaidOrder(admin, mobile);
        if (!latestOrder) {
          return NextResponse.json({ error: "找不到可退款的付款記錄" }, { status: 409 });
        }
        if (latestOrder.id !== orderId) {
          return NextResponse.json(
            { error: "只可退款最近一筆付款，請重新載入後再確認。" },
            { status: 409 }
          );
        }

        const refundAmount = toSafeNumber(latestOrder.final_amount_hkd);
        if (!(refundAmount > 0)) {
          return NextResponse.json({ error: "退款金額無效" }, { status: 409 });
        }

        const paymentAttemptId = readString(latestOrder.airwallex_payment_attempt_id);
        const paymentIntentId = readString(latestOrder.airwallex_payment_intent_id);
        if (!paymentAttemptId && !paymentIntentId) {
          return NextResponse.json(
            { error: "找不到 Airwallex 付款參考，不能退款。" },
            { status: 409 }
          );
        }

        const { data: existingRefund, error: existingRefundErr } = await admin
          .from("parent_payment_refunds")
          .select("id,status,airwallex_refund_id")
          .eq("payment_order_id", latestOrder.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingRefundErr) {
          if (isMissingPaymentOpsTableError(existingRefundErr.message)) {
            throw new Error(PAYMENT_OPS_TABLE_HINT);
          }
          throw existingRefundErr;
        }
        if (
          existingRefund &&
          String(existingRefund.status || "").toLowerCase() !== "failed"
        ) {
          return NextResponse.json(
            { error: "此付款已提交退款，請勿重複操作。" },
            { status: 409 }
          );
        }

        const refundRequestId = crypto.randomUUID();
        const { data: insertedRefundRows, error: insertRefundErr } = await admin
          .from("parent_payment_refunds")
          .insert({
            payment_order_id: latestOrder.id,
            parent_id: parent.id,
            mobile_number: mobile,
            admin_user: adminUser,
            reason,
            amount_hkd: refundAmount,
            currency: "HKD",
            airwallex_request_id: refundRequestId,
            airwallex_payment_intent_id: paymentIntentId,
            airwallex_payment_attempt_id: paymentAttemptId,
            status: "initiated",
          })
          .select("id")
          .limit(1);
        if (insertRefundErr) {
          const errMsg = insertRefundErr.message || "";
          if (/duplicate key|unique/i.test(errMsg)) {
            return NextResponse.json(
              { error: "此付款已提交退款，請勿重複操作。" },
              { status: 409 }
            );
          }
          if (isMissingPaymentOpsTableError(errMsg)) {
            throw new Error(PAYMENT_OPS_TABLE_HINT);
          }
          throw insertRefundErr;
        }
        const refundRowId = readString(insertedRefundRows?.[0]?.id);
        if (!refundRowId) {
          throw new Error("建立退款記錄失敗");
        }

        try {
          const baseUrl = getAirwallexBaseUrl();
          const accessToken = await getAirwallexAccessToken(baseUrl);
          const refundCreateRes = await fetch(`${baseUrl}/api/v1/pa/refunds/create`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              request_id: refundRequestId,
              reason,
              amount: refundAmount,
              payment_attempt_id: paymentAttemptId || undefined,
              payment_intent_id: paymentAttemptId ? undefined : paymentIntentId,
            }),
            cache: "no-store",
          });
          const refundCreateBody = await readAirwallexApiBody(refundCreateRes);
          if (!refundCreateRes.ok) {
            const failureMessage = formatAirwallexError({
              action: "refunds/create",
              status: refundCreateRes.status,
              body: refundCreateBody,
            });
            await admin
              .from("parent_payment_refunds")
              .update({
                status: "failed",
                failure_code: readString(refundCreateBody.json?.code),
                failure_message: failureMessage,
                raw_response: refundCreateBody.json || { raw: refundCreateBody.text },
                updated_at: new Date().toISOString(),
              })
              .eq("id", refundRowId);
            await logAdminPaymentAction({
              admin,
              actionType: "refund_last_payment",
              status: "failed",
              adminUser,
              mobile,
              parentId: parent.id,
              paymentOrderId: latestOrder.id,
              recurringProfileId: null,
              message: failureMessage,
              payload: {
                refund_row_id: refundRowId,
                refund_request_id: refundRequestId,
              },
            });
            throw new Error(failureMessage);
          }

          const refundId = readString(refundCreateBody.json?.id);
          const refundStatusUpper =
            readString(refundCreateBody.json?.status)?.toUpperCase() || "RECEIVED";
          const normalizedStatus = normalizeRefundStatus(refundStatusUpper);
          await admin
            .from("parent_payment_refunds")
            .update({
              airwallex_refund_id: refundId,
              status: normalizedStatus,
              failure_code: null,
              failure_message: null,
              raw_response: refundCreateBody.json || { raw: refundCreateBody.text },
              updated_at: new Date().toISOString(),
            })
            .eq("id", refundRowId);

          if (!REFUND_SUCCESS_STATUSES.has(refundStatusUpper)) {
            await logAdminPaymentAction({
              admin,
              actionType: "refund_last_payment",
              status: "failed",
              adminUser,
              mobile,
              parentId: parent.id,
              paymentOrderId: latestOrder.id,
              recurringProfileId: null,
              message: `退款狀態異常：${refundStatusUpper}`,
              payload: {
                refund_row_id: refundRowId,
                refund_id: refundId,
                refund_status: refundStatusUpper,
              },
            });
            return NextResponse.json(
              { error: `退款未成功（狀態：${refundStatusUpper}）` },
              { status: 409 }
            );
          }

          const recurringProfile = await getRecurringProfileByMobile(admin, mobile);
          let consentDisabled = false;
          let consentStatus: string | null = null;
          if (
            recurringProfile &&
            String(recurringProfile.status || "").toLowerCase() !== "cancelled"
          ) {
            if (recurringProfile.airwallex_payment_consent_id) {
              const disableResult = await disablePaymentConsent({
                consentId: recurringProfile.airwallex_payment_consent_id,
              });
              consentDisabled = disableResult.disabled;
              consentStatus = disableResult.status;
            }
            await cancelRecurringLocally({
              admin,
              profileId: recurringProfile.id,
            });
          }

          await downgradeParentToFree({
            admin,
            parentId: parent.id,
          });

          await logAdminPaymentAction({
            admin,
            actionType: "refund_last_payment",
            status: "success",
            adminUser,
            mobile,
            parentId: parent.id,
            paymentOrderId: latestOrder.id,
            recurringProfileId: recurringProfile?.id ?? null,
            message: "Refunded last payment and downgraded parent to free",
            payload: {
              refund_row_id: refundRowId,
              refund_id: refundId,
              refund_status: refundStatusUpper,
              consent_disabled: consentDisabled,
              consent_status: consentStatus,
              downgraded_to_free: true,
            },
          });

          return NextResponse.json({
            data: {
              ok: true,
              refund_id: refundId,
              refund_status: refundStatusUpper,
              refund_amount_hkd: refundAmount,
              parent_tier: "free",
              recurring_status: "cancelled",
            },
          });
        } catch (refundErr) {
          if (refundErr instanceof Error && refundErr.message === PAYMENT_OPS_TABLE_HINT) {
            throw refundErr;
          }
          throw refundErr;
        }
      }
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
