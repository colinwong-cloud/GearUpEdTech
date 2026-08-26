import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CHINESE_QUIZ_SUBJECT,
  ENGLISH_QUIZ_SUBJECT,
  PRIMARY_QUIZ_SUBJECT,
  quizSubjectDbPatterns,
} from "@/lib/quiz-subjects";
import { resolveTutorBoundStudentFromHash } from "@/lib/server/tutor-bound-students";
import { requireTutorSession } from "@/lib/server/tutor-session";
import { getTutorHashSecret } from "@/lib/server/tutor-student-hash";

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
  if (!hashParam) {
    return NextResponse.json({ error: "請從導師主頁選擇一位學生。" }, { status: 400 });
  }

  const resolved = await resolveTutorBoundStudentFromHash(
    admin,
    profile.codeId,
    hashParam,
    getTutorHashSecret()
  );
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const boundStudent = resolved.student;
  const studentId = boundStudent.studentId;
  const studentName = boundStudent.studentName;
  const mobile = boundStudent.registeredMobile;

  const subjects = quizSubjectDbPatterns(subject);
  const sessRes = await admin
    .from("quiz_sessions")
    .select("id,student_id,subject,questions_attempted,score,time_spent_seconds,created_at")
    .eq("student_id", studentId)
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

  const sessions = (sessRes.data ?? []).map((row) => {
    const rowStudentId = String(row.student_id ?? "").trim();
    return {
      id: String(row.id ?? ""),
      student_id: rowStudentId,
      student_name: studentName,
      subject: String(row.subject ?? ""),
      questions_attempted: Number(row.questions_attempted ?? 0),
      score: Number(row.score ?? 0),
      time_spent_seconds: Number(row.time_spent_seconds ?? 0),
      created_at: String(row.created_at ?? ""),
    };
  });

  const charts: Array<{ student_id: string; student_name: string; data: unknown }> = [];
  const chartRes = await admin.rpc("get_student_chart_data", {
    p_student_id: studentId,
    p_subject: subject,
  });
  if (!chartRes.error) {
    const data = chartRes.data as { sessions?: unknown[] } | null;
    if (data && Array.isArray(data.sessions) && data.sessions.length > 0) {
      charts.push({
        student_id: studentId,
        student_name: studentName,
        data,
      });
    }
  }

  return NextResponse.json({
    data: {
      sessions,
      registered_mobile: mobile,
      student_id: studentId,
      student_name: studentName,
      charts,
    },
  });
}
