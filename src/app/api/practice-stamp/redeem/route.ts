import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { executePracticeStampRedeem } from "@/lib/server/practice-stamp-redeem";

type RedeemBody = {
  student_id?: string;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "service_unavailable" },
      { status: 503 }
    );
  }

  let body: RedeemBody;
  try {
    body = (await req.json()) as RedeemBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const studentId = String(body.student_id ?? "").trim();
  if (!studentId) {
    return NextResponse.json({ ok: false, error: "missing_student_id" }, { status: 400 });
  }

  const result = await executePracticeStampRedeem(admin, studentId);
  if (!result.ok) {
    const status =
      result.error === "redeem_rpc_not_deployed" ? 503 : 409;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
