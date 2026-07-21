import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";

type TodayPayload = {
  free_tier_new_users_today?: number;
  paid_tier_new_users_today?: number;
  today_new_parent_registrations?: Array<{
    mobile_number: string;
    email: string | null;
    created_at: string | null;
  }>;
  [key: string]: unknown;
};

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

function getHkDayWindowUtcIso(now = new Date()) {
  const hkNow = new Date(now.getTime() + HK_OFFSET_MS);
  const y = hkNow.getUTCFullYear();
  const m = hkNow.getUTCMonth();
  const d = hkNow.getUTCDate();
  const dayStartUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - HK_OFFSET_MS);
  const dayEndUtc = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - HK_OFFSET_MS);
  return {
    dayStartIso: dayStartUtc.toISOString(),
    dayEndIso: dayEndUtc.toISOString(),
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
  const { data, error } = await admin.rpc("admin_today_business");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = (data as TodayPayload | null) ?? {};
  const { dayStartIso, dayEndIso } = getHkDayWindowUtcIso();

  try {
    const { data: todayParents, error: todayParentsErr } = await admin
      .from("parents")
      .select("mobile_number,email,created_at")
      .not("mobile_number", "like", "9999%")
      .gte("created_at", dayStartIso)
      .lt("created_at", dayEndIso)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (!todayParentsErr) {
      payload.today_new_parent_registrations = (todayParents ?? []).map((row) => ({
        mobile_number: String(row.mobile_number ?? ""),
        email:
          row.email === null || row.email === undefined
            ? null
            : String(row.email),
        created_at:
          row.created_at === null || row.created_at === undefined
            ? null
            : String(row.created_at),
      }));
    } else {
      payload.today_new_parent_registrations = payload.today_new_parent_registrations ?? [];
    }
  } catch {
    payload.today_new_parent_registrations = payload.today_new_parent_registrations ?? [];
  }

  try {
    const { count, error: freeErr } = await admin
      .from("parents")
      .select("id", { count: "exact", head: true })
      .not("mobile_number", "like", "9999%")
      .gte("created_at", dayStartIso)
      .lt("created_at", dayEndIso);
    if (!freeErr && typeof count === "number") {
      payload.free_tier_new_users_today = count;
    }
  } catch {
    payload.free_tier_new_users_today = payload.free_tier_new_users_today ?? 0;
  }

  try {
    const { count, error: paidErr } = await admin
      .from("parents")
      .select("id", { count: "exact", head: true })
      .not("mobile_number", "like", "9999%")
      .gte("paid_started_at", dayStartIso)
      .lt("paid_started_at", dayEndIso);

    if (!paidErr && typeof count === "number") {
      payload.paid_tier_new_users_today = count;
    } else if (paidErr && /paid_started_at/i.test(paidErr.message)) {
      // Legacy fallback: some installs may not have paid_started_at.
      const { count: recurringCount, error: recurringErr } = await admin
      .from("parent_recurring_profiles")
      .select("id", { count: "exact", head: true })
      .not("mobile_number", "like", "9999%")
      .gte("created_at", dayStartIso)
      .lt("created_at", dayEndIso);

      if (!recurringErr && typeof recurringCount === "number") {
        payload.paid_tier_new_users_today = recurringCount;
      } else {
        payload.paid_tier_new_users_today = payload.paid_tier_new_users_today ?? 0;
      }
    } else if (paidErr) {
      payload.paid_tier_new_users_today = payload.paid_tier_new_users_today ?? 0;
    }
  } catch {
    payload.paid_tier_new_users_today = payload.paid_tier_new_users_today ?? 0;
  }

  return NextResponse.json({ data: payload });
}
