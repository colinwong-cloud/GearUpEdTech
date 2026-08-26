import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listTutorBoundStudents } from "@/lib/server/tutor-bound-students";
import { requireTutorSession } from "@/lib/server/tutor-session";
import {
  computeTutorStudentScopeHash,
  getTutorHashSecret,
} from "@/lib/server/tutor-student-hash";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (!Number.isFinite(size) || size <= 0) return [values];
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

function compareTutorStudentRows(
  a: { registered_mobile: string; student_name: string; last_practice_at: string | null },
  b: { registered_mobile: string; student_name: string; last_practice_at: string | null }
): number {
  const aTs = a.last_practice_at ? new Date(a.last_practice_at).getTime() : 0;
  const bTs = b.last_practice_at ? new Date(b.last_practice_at).getTime() : 0;
  if (aTs !== bTs) return bTs - aTs;
  const mobileCmp = a.registered_mobile.localeCompare(b.registered_mobile);
  if (mobileCmp !== 0) return mobileCmp;
  return a.student_name.localeCompare(b.student_name, "zh-Hant");
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

  const keyword = (req.nextUrl.searchParams.get("q") || "").trim();
  const listed = await listTutorBoundStudents(admin, profile.codeId, keyword);
  if ("error" in listed) {
    return NextResponse.json({ error: listed.error }, { status: listed.status });
  }

  const lastPracticeByStudentId = new Map<string, string>();
  const studentIds = listed.students.map((row) => row.studentId);
  for (const chunk of chunkArray(studentIds, 500)) {
    if (chunk.length === 0) continue;
    const sessionResForChunk = await admin
      .from("quiz_sessions")
      .select("student_id,created_at")
      .in("student_id", chunk)
      .order("created_at", { ascending: false })
      .limit(20000);
    if (sessionResForChunk.error) {
      return NextResponse.json(
        { error: sessionResForChunk.error.message || "無法讀取練習紀錄。" },
        { status: 500 }
      );
    }
    for (const sessionRow of sessionResForChunk.data ?? []) {
      const studentId = String(sessionRow.student_id ?? "").trim();
      const createdAt = String(sessionRow.created_at ?? "").trim();
      if (!studentId || !createdAt) continue;
      if (lastPracticeByStudentId.has(studentId)) continue;
      lastPracticeByStudentId.set(studentId, createdAt);
    }
  }

  const hashSecret = getTutorHashSecret();
  const rows = listed.students
    .map((student) => ({
      student_id: student.studentId,
      student_name: student.studentName,
      registered_mobile: student.registeredMobile,
      hash: computeTutorStudentScopeHash(
        student.registeredMobile,
        student.studentId,
        hashSecret
      ),
      linked_at: student.linkedAt,
      last_practice_at: lastPracticeByStudentId.get(student.studentId) || null,
    }))
    .sort(compareTutorStudentRows);

  return NextResponse.json({ data: rows });
}
