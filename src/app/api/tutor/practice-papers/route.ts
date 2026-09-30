import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { subjectDisplayLabel } from "@/lib/quiz-subjects";
import { resolveTutorBoundStudentFromHash } from "@/lib/server/tutor-bound-students";
import { createPracticePaper, listStudentPracticePapers } from "@/lib/server/tutor-practice-paper-store";
import { requireTutorSession } from "@/lib/server/tutor-session";
import { getTutorHashSecret } from "@/lib/server/tutor-student-hash";

function paperJson(paper: {
  id: string;
  studentName: string;
  gradeLevel: string;
  subject: string;
  createdAt: string;
}) {
  return {
    id: paper.id,
    student_name: paper.studentName,
    grade_level: paper.gradeLevel,
    subject: paper.subject,
    subject_label: subjectDisplayLabel(paper.subject),
    created_at: paper.createdAt,
  };
}

async function boundStudent(req: NextRequest, hash: string) {
  const sessionRes = await requireTutorSession(req, { requirePasswordChanged: true });
  if (sessionRes.response || !sessionRes.profile) {
    return { response: sessionRes.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 }) };
  }
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) {
    return { response: NextResponse.json({ error: "系統未配置 Supabase 管理金鑰。" }, { status: 503 }) };
  }
  const admin = createClient(url, serviceRole);
  const resolved = await resolveTutorBoundStudentFromHash(
    admin,
    sessionRes.profile.codeId,
    hash,
    getTutorHashSecret()
  );
  if ("error" in resolved) {
    return { response: NextResponse.json({ error: resolved.error }, { status: resolved.status }) };
  }
  return { profile: sessionRes.profile, student: resolved.student };
}

export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash")?.trim() || "";
  if (!hash) return NextResponse.json({ error: "缺少學生連結。" }, { status: 400 });
  const bound = await boundStudent(req, hash);
  if (!("student" in bound) || !bound.profile || !bound.student) {
    return bound.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
  }
  try {
    const listed = await listStudentPracticePapers({
      codeId: bound.profile.codeId,
      studentId: bound.student.studentId,
    });
    if (!listed.ok) return NextResponse.json({ error: listed.error }, { status: listed.status });
    return NextResponse.json({
      data: {
        month_key: listed.monthKey,
        used: listed.used,
        limit: listed.limit,
        papers: listed.papers.map(paperJson),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入練習卷。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { hash?: string; subject?: string };
  try {
    body = (await req.json()) as { hash?: string; subject?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const hash = String(body.hash ?? "").trim();
  if (!hash) return NextResponse.json({ error: "缺少學生連結。" }, { status: 400 });
  const bound = await boundStudent(req, hash);
  if (!("student" in bound) || !bound.profile || !bound.student) {
    return bound.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
  }
  try {
    const created = await createPracticePaper({
      codeId: bound.profile.codeId,
      studentId: bound.student.studentId,
      studentName: bound.student.studentName,
      subject: String(body.subject ?? ""),
    });
    if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });
    return NextResponse.json({
      data: {
        paper: paperJson(created.paper),
        used: created.used,
        limit: created.limit,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未能生成練習卷。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
