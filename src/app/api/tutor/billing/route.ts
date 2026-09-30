import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTutorSession } from "@/lib/server/tutor-session";
import { TUTOR_PLAN_PRICE_HKD } from "@/lib/tutor-billing";
import { tutorComparisonUnlocked } from "@/lib/tutor-student-comparison";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

export async function GET(req: NextRequest) {
  const sessionRes = await requireTutorSession(req, { requirePasswordChanged: true });
  if (sessionRes.response || !sessionRes.profile) {
    return sessionRes.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "系統未配置 Supabase 管理金鑰。" }, { status: 503 });
  const codeRes = await admin
    .from("tutor_referral_codes")
    .select("paid_until")
    .eq("id", sessionRes.profile.codeId)
    .maybeSingle();
  if (codeRes.error) {
    return NextResponse.json({ error: codeRes.error.message }, { status: 500 });
  }
  const paidUntil = codeRes.data?.paid_until ? String(codeRes.data.paid_until) : null;
  return NextResponse.json({
    data: {
      priceHkd: TUTOR_PLAN_PRICE_HKD,
      paidUntil,
      active: tutorComparisonUnlocked(paidUntil),
    },
  });
}
