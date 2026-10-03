import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTutorSession } from "@/lib/server/tutor-session";
import { createTutorPlanCheckout } from "@/lib/server/tutor-billing";
import { TUTOR_PLAN_PRICE_HKD } from "@/lib/tutor-billing";

export const dynamic = "force-dynamic";

const SQL_HINT = "缺少導師付款資料表，請先在 Supabase 執行 supabase_tutor_paid_plan.sql。";

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
  const codeRes = await admin
    .from("tutor_referral_codes")
    .select("id,code,tutor_name,tutor_mobile,tutor_email")
    .eq("id", sessionRes.profile.codeId)
    .maybeSingle();
  if (codeRes.error) {
    return NextResponse.json({ error: codeRes.error.message }, { status: 500 });
  }
  if (!codeRes.data) return NextResponse.json({ error: "找不到導師帳戶。" }, { status: 404 });
  try {
    const checkout = await createTutorPlanCheckout({
      supabase: admin,
      codeId: String(codeRes.data.id),
      code: String(codeRes.data.code),
      tutorName: codeRes.data.tutor_name ? String(codeRes.data.tutor_name) : null,
      mobile: codeRes.data.tutor_mobile ? String(codeRes.data.tutor_mobile) : null,
      email: codeRes.data.tutor_email ? String(codeRes.data.tutor_email) : null,
    });
    return NextResponse.json({
      intent_id: checkout.intentId,
      client_secret: checkout.clientSecret,
      customer_id: checkout.customerId,
      currency: "HKD",
      country_code: "HK",
      final_amount_hkd: checkout.amount,
      methods: checkout.methods,
      payment_method: "all",
      airwallex_locale: "zh-HK",
      payer: "tutor",
      price_hkd: TUTOR_PLAN_PRICE_HKD,
      payment_consent: {
        next_triggered_by: "merchant",
        merchant_trigger_reason: "scheduled",
        terms_of_use: checkout.terms,
      },
      recurring_terms_of_use: checkout.terms,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未能建立導師付款。";
    const status = /tutor_payment_orders|42P01|does not exist/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? SQL_HINT : message }, { status });
  }
}
