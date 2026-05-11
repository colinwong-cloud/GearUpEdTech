import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

type TrendRow = {
  y: number;
  m: number;
  key: string;
  registrations: number;
  practice_students: number;
  parent_views: number;
  male: number;
  female: number;
  undisclosed: number;
  free_tier_new_users?: number;
  paid_tier_new_users?: number;
};

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

function isStatementTimeoutMessage(message: string): boolean {
  return /statement timeout|canceling statement due to statement timeout/i.test(message);
}

function formatUtcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildTrendSkeleton(now = new Date()): TrendRow[] {
  const hkNow = new Date(now.getTime() + HK_OFFSET_MS);
  const y = hkNow.getUTCFullYear();
  const m = hkNow.getUTCMonth();
  const d = hkNow.getUTCDate();
  const throughUtc = new Date(Date.UTC(y, m, d - 1));
  const monthStartUtc = new Date(Date.UTC(y, m, 1));

  const rows: TrendRow[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const cursor = new Date(Date.UTC(monthStartUtc.getUTCFullYear(), monthStartUtc.getUTCMonth() - i, 1));
    const yy = cursor.getUTCFullYear();
    const mm = cursor.getUTCMonth() + 1;
    rows.push({
      y: yy,
      m: mm,
      key: `${yy}-${String(mm).padStart(2, "0")}`,
      registrations: 0,
      practice_students: 0,
      parent_views: 0,
      male: 0,
      female: 0,
      undisclosed: 0,
      free_tier_new_users: 0,
      paid_tier_new_users: 0,
    });
  }

  // Keep through_hkt alignment with existing SQL (through yesterday).
  if (throughUtc < new Date(Date.UTC(y, m - 11, 1))) {
    return rows.slice(-1);
  }
  return rows;
}

async function countDistinctStudentsInMonth({
  admin,
  monthStartIso,
  todayStartIso,
}: {
  admin: SupabaseClient;
  monthStartIso: string;
  todayStartIso: string;
}): Promise<number> {
  const unique = new Set<string>();
  for (let offset = 0; offset < 200000; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("quiz_sessions")
      .select("student_id")
      .not("student_id", "is", null)
      .gt("questions_attempted", 0)
      .gte("created_at", monthStartIso)
      .lt("created_at", todayStartIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data) break;
    for (const row of data as Array<{ student_id?: string | null }>) {
      if (row.student_id) unique.add(row.student_id);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return unique.size;
}

async function sumQuestionsAttemptedInMonth({
  admin,
  monthStartIso,
  todayStartIso,
}: {
  admin: SupabaseClient;
  monthStartIso: string;
  todayStartIso: string;
}): Promise<number> {
  let total = 0;
  for (let offset = 0; offset < 200000; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("quiz_sessions")
      .select("questions_attempted")
      .not("student_id", "is", null)
      .gt("questions_attempted", 0)
      .gte("created_at", monthStartIso)
      .lt("created_at", todayStartIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data) break;
    for (const row of data as Array<{ questions_attempted?: number | null }>) {
      total += Number(row.questions_attempted ?? 0);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return total;
}

async function buildTimeoutSafeMonthlyPayload(
  admin: SupabaseClient
): Promise<MonthlySummaryPayload> {
  const hkNow = new Date(Date.now() + HK_OFFSET_MS);
  const throughUtc = new Date(
    Date.UTC(hkNow.getUTCFullYear(), hkNow.getUTCMonth(), hkNow.getUTCDate() - 1)
  );
  const throughHkt = formatUtcDateOnly(throughUtc);
  const monthStartUtc = new Date(
    Date.UTC(hkNow.getUTCFullYear(), hkNow.getUTCMonth(), 1)
  );
  const monthStartHkt = formatUtcDateOnly(monthStartUtc);
  const { monthStartIso, todayStartIso } = getHkMonthWindowUtcIso();

  const payload: MonthlySummaryPayload = {
    through_hkt: throughHkt,
    mt_year: throughUtc.getUTCFullYear(),
    mt_month: throughUtc.getUTCMonth() + 1,
    mt_new_students: 0,
    mt_practice_students: 0,
    mt_parent_views: 0,
    mt_practice_sessions: 0,
    mt_session_answers: 0,
    alltime_students: 0,
    alltime_parents: 0,
    alltime_practice_sessions: 0,
    alltime_session_answers: 0,
    trend_12m: buildTrendSkeleton(hkNow),
    available_districts: [],
    mt_new_free_tier_users: 0,
    mt_new_paid_tier_users: 0,
  };

  try {
    const [{ count: mtStudents }, { count: allStudents }, { count: allParents }, { count: mtSessions }, { count: allSessions }, { count: allAnswers }] =
      await Promise.all([
        admin
          .from("students")
          .select("id,parent:parents!inner(mobile_number)", { count: "exact", head: true })
          .not("parent.mobile_number", "like", "9999%")
          .gte("hkt_reg_date", monthStartHkt)
          .lte("hkt_reg_date", throughHkt),
        admin
          .from("students")
          .select("id,parent:parents!inner(mobile_number)", { count: "exact", head: true })
          .not("parent.mobile_number", "like", "9999%"),
        admin
          .from("parents")
          .select("id", { count: "exact", head: true })
          .not("mobile_number", "like", "9999%"),
        admin
          .from("quiz_sessions")
          .select("id", { count: "exact", head: true })
          .not("student_id", "is", null)
          .gt("questions_attempted", 0)
          .gte("created_at", monthStartIso)
          .lt("created_at", todayStartIso),
        admin
          .from("quiz_sessions")
          .select("id", { count: "exact", head: true })
          .not("student_id", "is", null)
          .gt("questions_attempted", 0),
        admin.from("session_answers").select("id", { count: "exact", head: true }),
      ]);

    payload.mt_new_students = typeof mtStudents === "number" ? mtStudents : 0;
    payload.alltime_students = typeof allStudents === "number" ? allStudents : 0;
    payload.alltime_parents = typeof allParents === "number" ? allParents : 0;
    payload.mt_practice_sessions = typeof mtSessions === "number" ? mtSessions : 0;
    payload.alltime_practice_sessions = typeof allSessions === "number" ? allSessions : 0;
    payload.alltime_session_answers = typeof allAnswers === "number" ? allAnswers : 0;
  } catch {
    // Keep timeout-safe payload available even if some counts fail.
  }

  try {
    payload.mt_practice_students = await countDistinctStudentsInMonth({
      admin,
      monthStartIso,
      todayStartIso,
    });
    payload.mt_session_answers = await sumQuestionsAttemptedInMonth({
      admin,
      monthStartIso,
      todayStartIso,
    });
  } catch {
    payload.mt_practice_students = payload.mt_practice_students ?? 0;
    payload.mt_session_answers = payload.mt_session_answers ?? 0;
  }

  try {
    const { data: districtsRows } = await admin
      .from("schools")
      .select("district")
      .not("district", "is", null)
      .order("district", { ascending: true })
      .limit(5000);

    const districts = Array.from(
      new Set(
        ((districtsRows ?? []) as Array<{ district?: string | null }>)
          .map((row) => String(row.district ?? "").trim())
          .filter((district) => district.length > 0)
      )
    );
    payload.available_districts = districts;
  } catch {
    payload.available_districts = payload.available_districts ?? [];
  }

  return payload;
}

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
  let payload: MonthlySummaryPayload;
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

    if (isStatementTimeoutMessage(error.message || "")) {
      payload = await buildTimeoutSafeMonthlyPayload(admin);
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    payload = (data as MonthlySummaryPayload | null) ?? {};
  }

  const trend = Array.isArray(payload.trend_12m) ? payload.trend_12m : [];

  try {
    // Parent dashboard views should reflect current MTD usage (including today).
    const { monthStartIso, todayStartIso } = getHkMonthWindowUtcIso();
    const nowIso = new Date().toISOString();
    const { count, error: countErr } = await admin
      .from("parent_dashboard_view_log")
      .select("id,parent:parents!inner(mobile_number)", {
        count: "exact",
        head: true,
      })
      .not("parent.mobile_number", "like", "9999%")
      .gte("viewed_at", monthStartIso)
      .lt("viewed_at", nowIso);
    if (!countErr && typeof count === "number") {
      payload.mt_parent_views = count;
    } else if (countErr) {
      // Legacy fallback: if relationship-based filtering fails, keep metric available.
      const { count: rawCount, error: rawErr } = await admin
        .from("parent_dashboard_view_log")
        .select("id", { count: "exact", head: true })
        .gte("viewed_at", monthStartIso)
        .lt("viewed_at", nowIso);
      if (!rawErr && typeof rawCount === "number") {
        payload.mt_parent_views = rawCount;
      }
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
