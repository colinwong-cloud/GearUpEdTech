import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";

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
  | "discount_code_usage_summary";

type RequestBody = {
  action?: AdminAction;
  payload?: Record<string, unknown>;
};

const DISCOUNT_CODE_RE = /^[A-Za-z0-9]{6}$/;

function normalizeIsoDateTime(raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
          if (rec.status.toLowerCase() === "paid") prev.paid_count += 1;
          prev.gross_amount_hkd += rec.amount_hkd;
          prev.final_amount_hkd += rec.final_amount_hkd;
          prev.discount_amount_hkd += rec.discount_amount_hkd;
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
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
