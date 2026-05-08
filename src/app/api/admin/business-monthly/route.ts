import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";

/* Heavy RPC: allow Vercel long enough to wait for PostgREST (monthly can run ~10–60s after SQL fix). */
export const maxDuration = 120;

type MonthlySummaryPayload = {
  mt_parent_views?: number;
  mt_new_free_tier_users?: number;
  mt_new_paid_tier_users?: number;
  trend_12m?: Array<Record<string, unknown>>;
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

function getHkIsoMonthKey(isoString: string | null | undefined): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  const hkDate = new Date(date.getTime() + HK_OFFSET_MS);
  const y = hkDate.getUTCFullYear();
  const m = hkDate.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function getOldestTrendMonthStartIso(
  trend: Array<Record<string, unknown>> | undefined,
  fallbackMonthStartIso: string
) {
  if (!trend || trend.length === 0) return fallbackMonthStartIso;
  const keys = trend
    .map((row) => (typeof row.key === "string" ? row.key : ""))
    .filter(Boolean)
    .sort();
  const oldest = keys[0];
  if (!oldest || !/^\d{4}-\d{2}$/.test(oldest)) return fallbackMonthStartIso;
  const [yRaw, mRaw] = oldest.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return fallbackMonthStartIso;
  }
  const startUtc = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - HK_OFFSET_MS);
  return startUtc.toISOString();
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
  const trend = Array.isArray(payload.trend_12m) ? payload.trend_12m : [];

  try {
    // Fallback safeguard for legacy installs: derive MTD parent views by viewed_at.
    const { monthStartIso, todayStartIso } = getHkMonthWindowUtcIso();
    const { count, error: countErr } = await admin
      .from("parent_dashboard_view_log")
      .select("id,parent:parents!inner(mobile_number)", {
        count: "exact",
        head: true,
      })
      .not("parent.mobile_number", "like", "9999%")
      .gte("viewed_at", monthStartIso)
      .lt("viewed_at", todayStartIso);
    if (!countErr && typeof count === "number") {
      payload.mt_parent_views = count;
    }

    const oldestTrendStartIso = getOldestTrendMonthStartIso(trend, monthStartIso);
    const freeByMonth = new Map<string, number>();
    const paidByMonth = new Map<string, number>();

    const { data: parentsRows, error: parentsErr } = await admin
      .from("parents")
      .select("created_at")
      .not("mobile_number", "like", "9999%")
      .gte("created_at", oldestTrendStartIso)
      .lt("created_at", todayStartIso);

    if (!parentsErr && Array.isArray(parentsRows)) {
      for (const row of parentsRows as Array<{ created_at?: string | null }>) {
        const key = getHkIsoMonthKey(row.created_at);
        if (!key) continue;
        freeByMonth.set(key, (freeByMonth.get(key) || 0) + 1);
      }
    }

    const { data: paidRows, error: paidErr } = await admin
      .from("parents")
      .select("paid_started_at")
      .not("mobile_number", "like", "9999%")
      .gte("paid_started_at", oldestTrendStartIso)
      .lt("paid_started_at", todayStartIso);

    if (!paidErr && Array.isArray(paidRows)) {
      for (const row of paidRows as Array<{ paid_started_at?: string | null }>) {
        const key = getHkIsoMonthKey(row.paid_started_at);
        if (!key) continue;
        paidByMonth.set(key, (paidByMonth.get(key) || 0) + 1);
      }
    } else if (paidErr && /paid_started_at/i.test(paidErr.message)) {
      // Legacy fallback: if paid_started_at is unavailable, derive from recurring profile creation.
      const { data: recurringRows, error: recurringErr } = await admin
        .from("parent_recurring_profiles")
        .select("created_at")
        .not("mobile_number", "like", "9999%")
        .gte("created_at", oldestTrendStartIso)
        .lt("created_at", todayStartIso);

      if (!recurringErr && Array.isArray(recurringRows)) {
        for (const row of recurringRows as Array<{ created_at?: string | null }>) {
          const key = getHkIsoMonthKey(row.created_at);
          if (!key) continue;
          paidByMonth.set(key, (paidByMonth.get(key) || 0) + 1);
        }
      }
    }

    const monthKey = getHkIsoMonthKey(monthStartIso);
    payload.mt_new_free_tier_users = monthKey ? freeByMonth.get(monthKey) || 0 : 0;
    payload.mt_new_paid_tier_users = monthKey ? paidByMonth.get(monthKey) || 0 : 0;

    if (trend.length > 0) {
      payload.trend_12m = trend.map((row) => {
        const key = typeof row.key === "string" ? row.key : "";
        return {
          ...row,
          free_tier_new_users: key ? freeByMonth.get(key) || 0 : 0,
          paid_tier_new_users: key ? paidByMonth.get(key) || 0 : 0,
        };
      });
    }
  } catch {
    // Keep summary response available even if fallback count fails.
    payload.mt_new_free_tier_users = payload.mt_new_free_tier_users ?? 0;
    payload.mt_new_paid_tier_users = payload.mt_new_paid_tier_users ?? 0;
  }

  return NextResponse.json({ data: payload });
}
