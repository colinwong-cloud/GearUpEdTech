import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type StudentLite = {
  id: string;
  parent_id: string;
  student_name: string;
  avatar_style: string;
  grade_level: string;
  created_at: string;
  gender?: string | null;
};

type LoginByMobileRpc = {
  parent_found: boolean;
  parent_id?: string | null;
  students: StudentLite[];
  tier?: "free" | "paid";
  is_paid?: boolean;
  paid_until?: string | null;
  tier_label?: string;
};

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return createClient(url, anon);
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase env not configured" },
      { status: 503 }
    );
  }

  let body: { mobile?: string; pin?: string };
  try {
    body = (await req.json()) as { mobile?: string; pin?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mobile = body.mobile?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";
  if (!mobile || !pin) {
    return NextResponse.json(
      { error: "Missing mobile or pin" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("login_by_mobile", {
    p_mobile_number: mobile,
    p_pin_code: pin,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as LoginByMobileRpc;
  if (!result?.parent_found || !Array.isArray(result.students)) {
    return NextResponse.json(
      { error: "找不到此電話號碼的帳戶，請先註冊。" },
      { status: 404 }
    );
  }
  if (result.students.length === 0) {
    return NextResponse.json(
      { error: "密碼不正確，請重試。" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    parent_found: true,
    parent_id: result.parent_id ?? null,
    students: result.students,
    tier: result.tier ?? "free",
    is_paid: Boolean(result.is_paid),
    paid_until: result.paid_until ?? null,
    tier_label: result.tier_label ?? (result.is_paid ? "月費用戶" : "免費用戶"),
  });
}
