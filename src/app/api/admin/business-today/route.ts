import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";

type TodayPayload = {
  free_tier_new_users_today?: number;
  paid_tier_new_users_today?: number;
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
      .from("parent_recurring_profiles")
      .select("id", { count: "exact", head: true })
      .not("mobile_number", "like", "9999%")
      .gte("created_at", dayStartIso)
      .lt("created_at", dayEndIso);
    if (!paidErr && typeof count === "number") {
      payload.paid_tier_new_users_today = count;
    } else if (paidErr) {
      payload.paid_tier_new_users_today = payload.paid_tier_new_users_today ?? 0;
    }
  } catch {
    payload.paid_tier_new_users_today = payload.paid_tier_new_users_today ?? 0;
  }

  return NextResponse.json({ data: payload });
}
