import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BASE_MONTHLY_MOBILE_QUOTA = 200;
const MOBILE_SHARED_QUOTA_POLICY_VERSION = "mobile-shared-quota-v1";
const TOPUP_DESCRIPTIONS = new Set(["管理員手動增加", "ADMIN_QUOTA_TOPUP"]);
const USAGE_DESCRIPTIONS_FOR_QUOTA = new Set([
  "FREE_TIER_USAGE",
  "ADMIN_QUOTA_USAGE",
  "練習作答扣除",
]);

type RequestBody = {
  mobile_number?: string;
};

type StudentRow = {
  id: string;
};

type TxRow = {
  change_amount: number | null;
  description: string | null;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

function logAntiMissingMobileSharedQuota(event: string, payload: Record<string, unknown>) {
  console.info(
    `[anti-missing][quota][mobile-shared] ${event} ${JSON.stringify({
      policy_version: MOBILE_SHARED_QUOTA_POLICY_VERSION,
      ...payload,
    })}`
  );
}

function getCurrentHktMonthRangeIso() {
  const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const now = new Date();
  const hktNow = new Date(now.getTime() + HKT_OFFSET_MS);
  const year = hktNow.getUTCFullYear();
  const month = hktNow.getUTCMonth();
  const monthStartUtcMs = Date.UTC(year, month, 1) - HKT_OFFSET_MS;
  const nextMonthStartUtcMs = Date.UTC(year, month + 1, 1) - HKT_OFFSET_MS;
  return {
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    startIso: new Date(monthStartUtcMs).toISOString(),
    endIso: new Date(nextMonthStartUtcMs).toISOString(),
  };
}

export async function POST(req: NextRequest) {
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

  const mobile = String(body.mobile_number || "").trim();
  if (!mobile) {
    return NextResponse.json({ error: "Missing mobile_number" }, { status: 400 });
  }

  const { data: parent, error: parentErr } = await admin
    .from("parents")
    .select("id,mobile_number")
    .eq("mobile_number", mobile)
    .maybeSingle();
  if (parentErr) {
    return NextResponse.json({ error: parentErr.message || "查詢家長失敗" }, { status: 500 });
  }
  if (!parent?.id) {
    return NextResponse.json({ error: "找不到此電話號碼" }, { status: 404 });
  }

  const { data: tierData, error: tierErr } = await admin.rpc("get_parent_tier_status", {
    p_mobile: mobile,
  });
  if (tierErr) {
    return NextResponse.json({ error: tierErr.message || "查詢會員狀態失敗" }, { status: 500 });
  }
  const isPaid = Boolean((tierData as { is_paid?: boolean } | null)?.is_paid);
  if (isPaid) {
    const month = getCurrentHktMonthRangeIso().month;
    logAntiMissingMobileSharedQuota("mobile-remaining-read", {
      mobile_number: mobile,
      is_paid: true,
      total_balance: -1,
      month,
    });
    return NextResponse.json({
      data: {
        is_paid: true,
        total_balance: -1,
        month,
      },
    });
  }

  const { data: students, error: studentsErr } = await admin
    .from("students")
    .select("id")
    .eq("parent_id", parent.id)
    .limit(2000);
  if (studentsErr) {
    return NextResponse.json({ error: studentsErr.message || "查詢學生失敗" }, { status: 500 });
  }
  const studentIds = ((students as StudentRow[] | null) ?? [])
    .map((row) => row.id)
    .filter(Boolean);

  const { month, startIso, endIso } = getCurrentHktMonthRangeIso();
  if (studentIds.length === 0) {
    logAntiMissingMobileSharedQuota("mobile-remaining-read", {
      mobile_number: mobile,
      is_paid: false,
      total_balance: BASE_MONTHLY_MOBILE_QUOTA,
      month,
      monthly_topup: 0,
      monthly_usage: 0,
    });
    return NextResponse.json({
      data: {
        is_paid: false,
        total_balance: BASE_MONTHLY_MOBILE_QUOTA,
        month,
      },
    });
  }

  const { data: txRows, error: txErr } = await admin
    .from("balance_transactions")
    .select("change_amount,description")
    .in("student_id", studentIds)
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  if (txErr) {
    return NextResponse.json({ error: txErr.message || "查詢配額紀錄失敗" }, { status: 500 });
  }

  let monthlyTopup = 0;
  let monthlyUsage = 0;
  for (const row of (txRows as TxRow[] | null) ?? []) {
    const description = String(row.description || "").trim();
    const change = Number(row.change_amount ?? 0);
    if (!description || !Number.isFinite(change)) continue;
    if (TOPUP_DESCRIPTIONS.has(description) && change > 0) {
      monthlyTopup += change;
    }
    if (USAGE_DESCRIPTIONS_FOR_QUOTA.has(description) && change < 0) {
      monthlyUsage += Math.abs(change);
    }
  }

  const totalBalance = Math.max(BASE_MONTHLY_MOBILE_QUOTA + monthlyTopup - monthlyUsage, 0);
  logAntiMissingMobileSharedQuota("mobile-remaining-read", {
    mobile_number: mobile,
    is_paid: false,
    total_balance: totalBalance,
    month,
    monthly_topup: monthlyTopup,
    monthly_usage: monthlyUsage,
  });
  return NextResponse.json({
    data: {
      is_paid: false,
      total_balance: totalBalance,
      month,
      monthly_topup: monthlyTopup,
      monthly_usage: monthlyUsage,
    },
  });
}
