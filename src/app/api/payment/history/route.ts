import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PaymentOrderRow = {
  id: string;
  paid_at: string | null;
  created_at: string | null;
  final_amount_hkd: number | null;
  payment_method: string | null;
  payment_method_label: string | null;
  payment_method_type: string | null;
  payment_method_brand: string | null;
};

type TierStatus = {
  is_paid?: boolean;
};

function getSupabaseAdminClient() {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

function toHkYear(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
  }).format(d);
  const parsed = Number(year);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeYear(value: unknown): number {
  const nowYear = new Date().getFullYear();
  const parsed =
    typeof value === "number"
      ? Math.trunc(value)
      : typeof value === "string"
        ? Math.trunc(Number(value))
        : NaN;
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > nowYear + 1) {
    return nowYear;
  }
  return parsed;
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel" },
      { status: 503 }
    );
  }

  let body: { mobile_number?: string; year?: number | string };
  try {
    body = (await req.json()) as { mobile_number?: string; year?: number | string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mobile = (body.mobile_number || "").trim();
  if (!/^\d{8}$/.test(mobile)) {
    return NextResponse.json({ error: "Invalid mobile number" }, { status: 400 });
  }

  const selectedYear = normalizeYear(body.year);
  const { data: tierData, error: tierErr } = await admin.rpc("get_parent_tier_status", {
    p_mobile: mobile,
  });
  if (tierErr) {
    return NextResponse.json({ error: tierErr.message }, { status: 500 });
  }

  const tier = (tierData as TierStatus | null) ?? {};
  if (!tier.is_paid) {
    return NextResponse.json(
      { error: "目前僅限月費用戶查看消費紀錄。" },
      { status: 403 }
    );
  }

  const { data, error } = await admin
    .from("parent_payment_orders")
    .select(
      "id,paid_at,created_at,final_amount_hkd,payment_method,payment_method_label,payment_method_type,payment_method_brand"
    )
    .eq("mobile_number", mobile)
    .eq("status", "paid")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PaymentOrderRow[];
  const yearSet = new Set<number>();
  const withYear = rows.map((row) => {
    const eventYear = toHkYear(row.paid_at || row.created_at);
    if (eventYear !== null) yearSet.add(eventYear);
    return { row, eventYear };
  });

  if (!yearSet.has(selectedYear)) {
    yearSet.add(selectedYear);
  }

  const availableYears = Array.from(yearSet).sort((a, b) => b - a);
  const records = withYear
    .filter((entry) => entry.eventYear === selectedYear)
    .map((entry) => entry.row);

  return NextResponse.json({
    records,
    available_years: availableYears,
  });
}
