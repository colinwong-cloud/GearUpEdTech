import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTutorSession } from "@/lib/server/tutor-session";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

export async function GET(req: NextRequest) {
  const sessionRes = await requireTutorSession(req, { requirePasswordChanged: true });
  if (sessionRes.response || !sessionRes.profile) {
    return sessionRes.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
  }
  const profile = sessionRes.profile;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "系統未配置 Supabase 管理金鑰。" }, { status: 503 });
  }

  const sessionId = String(req.nextUrl.searchParams.get("session_id") || "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "缺少 session_id。" }, { status: 400 });
  }

  const quizRes = await admin
    .from("quiz_sessions")
    .select("id,student_id,subject,questions_attempted,score,time_spent_seconds,created_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (quizRes.error) {
    return NextResponse.json({ error: quizRes.error.message || "無法讀取練習紀錄。" }, { status: 500 });
  }
  if (!quizRes.data) {
    return NextResponse.json({ error: "找不到練習紀錄。" }, { status: 404 });
  }

  const studentId = String(quizRes.data.student_id ?? "").trim();
  const stuRes = await admin
    .from("students")
    .select("id,parent_id,student_name")
    .eq("id", studentId)
    .maybeSingle();
  if (stuRes.error || !stuRes.data) {
    return NextResponse.json({ error: "找不到學生資料。" }, { status: 404 });
  }

  const parentId = String(stuRes.data.parent_id ?? "").trim();
  const parentRes = await admin
    .from("parents")
    .select("id,mobile_number")
    .eq("id", parentId)
    .maybeSingle();
  if (parentRes.error || !parentRes.data) {
    return NextResponse.json({ error: "找不到家長資料。" }, { status: 404 });
  }
  const registeredMobile = String(parentRes.data.mobile_number ?? "").trim();

  const usageRes = await admin
    .from("tutor_referral_usages")
    .select("id")
    .eq("code_id", profile.codeId)
    .eq("mobile_number", registeredMobile)
    .limit(1)
    .maybeSingle();
  if (usageRes.error) {
    return NextResponse.json({ error: usageRes.error.message || "無法驗證資料權限。" }, { status: 500 });
  }
  if (!usageRes.data) {
    return NextResponse.json({ error: "你只能查看已綁定在此教師編號下的練習紀錄。" }, { status: 403 });
  }

  const detailRes = await admin.rpc("get_session_detail", {
    p_session_id: sessionId,
  });
  if (detailRes.error) {
    return NextResponse.json(
      { error: detailRes.error.message || "無法讀取練習詳情。" },
      { status: 500 }
    );
  }
  const payload = (detailRes.data as { session?: unknown; answers?: unknown[] } | null) ?? {
    session: null,
    answers: [],
  };

  return NextResponse.json({
    data: {
      session: payload.session ?? quizRes.data,
      answers: payload.answers ?? [],
      student_name: String(stuRes.data.student_name ?? "學生"),
      registered_mobile: registeredMobile,
    },
  });
}
