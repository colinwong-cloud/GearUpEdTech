import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";

/* Heavy RPC: allow Vercel long enough to wait for PostgREST (monthly can run ~10–60s after SQL fix). */
export const maxDuration = 120;

type MonthlySummaryPayload = {
  mt_parent_views?: number;
  [key: string]: unknown;
};

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

function getHkMonthWindowUtcIso(now = new Date()) {
  const hkNow = new Date(now.getTime() + HK_OFFSET_MS);
  const y = hkNow.getUTCFullYear();
  const m = hkNow.getUTCMonth();
  const d = hkNow.getUTCDate();
  const monthStartUtc = new Date(Date.UTC(y, m, 1, 0, 0, 0) - HK_OFFSET_MS);
  const todayStartUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - HK_OFFSET_MS);
  return {
    monthStartIso: monthStartUtc.toISOString(),
    todayStartIso: todayStartUtc.toISOString(),
  };
}

export async function POST(req: NextRequest) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel" },
      { status: 503 }
    );
  }
  const admin = createClient(url, key);
  const { data, error } = await admin.rpc("admin_business_monthly_summary");
  if (error) {
    if (/admin_business_monthly_summary/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "Missing SQL function admin_business_monthly_summary. Please run supabase_admin_business_kpi_filter_first.sql in Supabase.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = (data as MonthlySummaryPayload | null) ?? {};
  try {
    // Fallback safeguard for legacy installs: derive MTD parent views by viewed_at.
    const { monthStartIso, todayStartIso } = getHkMonthWindowUtcIso();
    const { count, error: countErr } = await admin
      .from("parent_dashboard_view_log")
      .select("id", { count: "exact", head: true })
      .gte("viewed_at", monthStartIso)
      .lt("viewed_at", todayStartIso);
    if (!countErr && typeof count === "number") {
      payload.mt_parent_views = count;
    }
  } catch {
    // Keep summary response available even if fallback count fails.
  }

  return NextResponse.json({ data: payload });
}
