import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CHINESE_QUIZ_SUBJECT,
  ENGLISH_QUIZ_SUBJECT,
  PRIMARY_QUIZ_SUBJECT,
  quizSubjectDbPatterns,
} from "@/lib/quiz-subjects";
import { requireTutorSession } from "@/lib/server/tutor-session";
import { computeTutorStudentHash, getTutorHashSecret } from "@/lib/server/tutor-student-hash";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

function parseMonthRange(yearRaw: string, monthRaw: string): { start: Date; end: Date } | null {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (!Number.isFinite(size) || size <= 0) return [values];
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
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

  const hashParam = String(req.nextUrl.searchParams.get("hash") || "").trim();
  const mobileParam = String(req.nextUrl.searchParams.get("mobile") || "").trim();
  const subject = String(req.nextUrl.searchParams.get("subject") || "").trim();
  const year = String(req.nextUrl.searchParams.get("year") || "").trim();
  const month = String(req.nextUrl.searchParams.get("month") || "").trim();
  const allowedSubjects = new Set([
    PRIMARY_QUIZ_SUBJECT,
    CHINESE_QUIZ_SUBJECT,
    ENGLISH_QUIZ_SUBJECT,
  ]);
  if (!allowedSubjects.has(subject)) {
    return NextResponse.json({ error: "科目參數不正確。" }, { status: 400 });
  }
  const monthRange = parseMonthRange(year, month);
  if (!monthRange) {
    return NextResponse.json({ error: "年月參數不正確。" }, { status: 400 });
  }

  // Resolve the visible URL token (hash) back to a registered mobile, scoped to
  // the mobiles bound under this tutor's referral code. This both hides the raw
  // mobile from the weblink and enforces that a tutor only sees their own students.
  let mobile = "";
  if (hashParam) {
    const boundRes = await admin
      .from("tutor_referral_usages")
      .select("mobile_number")
      .eq("code_id", profile.codeId)
      .limit(10000);
    if (boundRes.error) {
      return NextResponse.json(
        { error: boundRes.error.message || "無法驗證資料權限。" },
        { status: 500 }
      );
    }
    const hashSecret = getTutorHashSecret();
    for (const row of boundRes.data ?? []) {
      const candidate = String(row.mobile_number ?? "").trim();
      if (!candidate) continue;
      if (computeTutorStudentHash(candidate, hashSecret) === hashParam) {
        mobile = candidate;
        break;
      }
    }
    if (!mobile) {
      return NextResponse.json(
        { error: "你只能查看已綁定在此教師編號下的登記手機。" },
        { status: 403 }
      );
    }
  } else {
    mobile = mobileParam;
    if (!/^\d{8}$/.test(mobile)) {
      return NextResponse.json({ error: "請提供有效的登記手機。" }, { status: 400 });
    }
    const usageRes = await admin
      .from("tutor_referral_usages")
      .select("id")
      .eq("code_id", profile.codeId)
      .eq("mobile_number", mobile)
      .limit(1)
      .maybeSingle();
    if (usageRes.error) {
      return NextResponse.json({ error: usageRes.error.message || "無法驗證資料權限。" }, { status: 500 });
    }
    if (!usageRes.data) {
      return NextResponse.json({ error: "你只能查看已綁定在此教師編號下的登記手機。" }, { status: 403 });
    }
  }

  const parentRes = await admin
    .from("parents")
    .select("id,mobile_number")
    .eq("mobile_number", mobile)
    .limit(100);
  if (parentRes.error) {
    return NextResponse.json({ error: parentRes.error.message || "無法讀取家長資料。" }, { status: 500 });
  }
  const parentIds = Array.from(
    new Set((parentRes.data ?? []).map((row) => String(row.id ?? "").trim()).filter(Boolean))
  );
  if (parentIds.length === 0) {
    return NextResponse.json({ data: { sessions: [], registered_mobile: mobile } });
  }

  const studentNameById = new Map<string, string>();
  const studentIds: string[] = [];
  for (const chunk of chunkArray(parentIds, 500)) {
    const studentRes = await admin
      .from("students")
      .select("id,student_name,parent_id")
      .in("parent_id", chunk)
      .limit(10000);
    if (studentRes.error) {
      return NextResponse.json(
        { error: studentRes.error.message || "無法讀取學生資料。" },
        { status: 500 }
      );
    }
    for (const row of studentRes.data ?? []) {
      const studentId = String(row.id ?? "").trim();
      if (!studentId) continue;
      studentIds.push(studentId);
      studentNameById.set(studentId, String(row.student_name ?? "學生"));
    }
  }
  if (studentIds.length === 0) {
    return NextResponse.json({ data: { sessions: [], registered_mobile: mobile } });
  }

  const subjects = quizSubjectDbPatterns(subject);
  const sessions: Array<{
    id: string;
    student_id: string;
    student_name: string;
    subject: string;
    questions_attempted: number;
    score: number;
    time_spent_seconds: number;
    created_at: string;
  }> = [];

  for (const chunk of chunkArray(studentIds, 500)) {
    const sessRes = await admin
      .from("quiz_sessions")
      .select("id,student_id,subject,questions_attempted,score,time_spent_seconds,created_at")
      .in("student_id", chunk)
      .in("subject", [...subjects])
      .gte("created_at", monthRange.start.toISOString())
      .lt("created_at", monthRange.end.toISOString())
      .order("created_at", { ascending: false })
      .limit(10000);
    if (sessRes.error) {
      return NextResponse.json(
        { error: sessRes.error.message || "無法讀取練習紀錄。" },
        { status: 500 }
      );
    }
    for (const row of sessRes.data ?? []) {
      const studentId = String(row.student_id ?? "").trim();
      sessions.push({
        id: String(row.id ?? ""),
        student_id: studentId,
        student_name: studentNameById.get(studentId) || "學生",
        subject: String(row.subject ?? ""),
        questions_attempted: Number(row.questions_attempted ?? 0),
        score: Number(row.score ?? 0),
        time_spent_seconds: Number(row.time_spent_seconds ?? 0),
        created_at: String(row.created_at ?? ""),
      });
    }
  }

  sessions.sort((a, b) => {
    const aTs = new Date(a.created_at).getTime();
    const bTs = new Date(b.created_at).getTime();
    return bTs - aTs;
  });

  return NextResponse.json({ data: { sessions, registered_mobile: mobile } });
}
