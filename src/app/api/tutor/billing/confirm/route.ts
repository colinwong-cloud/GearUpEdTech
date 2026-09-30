import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTutorSession } from "@/lib/server/tutor-session";
import { confirmTutorPlanPayment } from "@/lib/server/tutor-billing";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

export async function POST(req: NextRequest) {
  const sessionRes = await requireTutorSession(req, { requirePasswordChanged: true });
  if (sessionRes.response || !sessionRes.profile) {
    return sessionRes.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "系統未配置 Supabase 管理金鑰。" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { intent_id?: string } | null;
  const intentId = String(body?.intent_id || "").trim();
  if (!intentId) return NextResponse.json({ error: "缺少付款編號。" }, { status: 400 });
  const result = await confirmTutorPlanPayment({
    supabase: admin,
    codeId: sessionRes.profile.codeId,
    paymentIntentId: intentId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error || "未能確認付款。" }, { status: 400 });
  return NextResponse.json({ data: { paid: result.paid, paid_until: result.paidUntil } });
}
