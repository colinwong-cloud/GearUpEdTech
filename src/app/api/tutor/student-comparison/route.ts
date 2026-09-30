import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTutorSession } from "@/lib/server/tutor-session";
import { resolveTutorBoundStudentFromHash } from "@/lib/server/tutor-bound-students";
import { getTutorHashSecret } from "@/lib/server/tutor-student-hash";
import { gradeDisplayLabel, isPracticePaperSubject } from "@/lib/tutor-practice-paper";
import {
  TUTOR_COMPARISON_MONTHLY_PRICE_HKD,
  buildPeerComparison,
  compareWithSelectedGroup,
  tutorComparisonUnlocked,
  type ComparisonMember,
} from "@/lib/tutor-student-comparison";

const COMPARE_GRADES = new Set(["P1", "P2", "P3", "P4", "P5", "P6"]);

export const dynamic = "force-dynamic";

const COMPARISON_SQL_HINT =
  "缺少同學對比功能，請先在 Supabase 執行 supabase_tutor_student_comparison.sql。";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

function isMissingComparisonSetup(message: string): boolean {
  return /tutor_student_peer_comparison|paid_until|42883|42703|does not exist/i.test(message);
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

  const hash = String(req.nextUrl.searchParams.get("hash") || "").trim();
  const subject = String(req.nextUrl.searchParams.get("subject") || "").trim();
  const compareGrade = String(req.nextUrl.searchParams.get("compareGrade") || "").trim().toUpperCase();
  const compareSchoolId = String(req.nextUrl.searchParams.get("compareSchoolId") || "").trim();
  const selectedGrade = COMPARE_GRADES.has(compareGrade) ? compareGrade : "";
  const selectedSchoolId = /^[0-9a-f-]{36}$/i.test(compareSchoolId) ? compareSchoolId : "";
  if (!hash) return NextResponse.json({ error: "缺少學生連結。" }, { status: 400 });
  if (!isPracticePaperSubject(subject)) {
    return NextResponse.json({ error: "請選擇科目。" }, { status: 400 });
  }

  let secret = "";
  try {
    secret = getTutorHashSecret();
  } catch (error) {
    const message = error instanceof Error ? error.message : "缺少導師連結密鑰。";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const resolved = await resolveTutorBoundStudentFromHash(admin, profile.codeId, hash, secret);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const paidRes = await admin
    .from("tutor_referral_codes")
    .select("paid_until")
    .eq("id", profile.codeId)
    .maybeSingle();
  if (paidRes.error) {
    const message = paidRes.error.message || "";
    if (isMissingComparisonSetup(message)) {
      return NextResponse.json({ error: COMPARISON_SQL_HINT }, { status: 503 });
    }
    return NextResponse.json({ error: message || "無法讀取導師方案。" }, { status: 500 });
  }

  const comparisonRes = await admin.rpc("tutor_student_peer_comparison", {
    p_student_id: resolved.student.studentId,
    p_subject: subject,
    p_compare_grade: selectedGrade || null,
    p_compare_school_id: selectedSchoolId || null,
  });
  if (comparisonRes.error) {
    const message = comparisonRes.error.message || "";
    if (isMissingComparisonSetup(message)) {
      return NextResponse.json({ error: COMPARISON_SQL_HINT }, { status: 503 });
    }
    return NextResponse.json({ error: message || "無法計算同學對比。" }, { status: 500 });
  }

  const raw = (comparisonRes.data ?? {}) as {
    error?: string;
    grade_level?: string;
    school_id?: string | null;
    school_name?: string | null;
    district?: string | null;
    members?: Array<{
      student_id?: string;
      school_id?: string | null;
      district?: string | null;
      accuracy?: number | null;
    }>;
    selected_grade?: string | null;
    selected_school_name?: string | null;
    selected_members?: Array<{
      student_id?: string;
      school_id?: string | null;
      district?: string | null;
      accuracy?: number | null;
    }>;
  };
  if (raw.error === "student_not_found") {
    return NextResponse.json({ error: "找不到該學生。" }, { status: 404 });
  }

  const gradeLabel = gradeDisplayLabel(String(raw.grade_level ?? ""));
  const schoolName = String(raw.school_name ?? "").trim();
  const district = String(raw.district ?? "").trim();
  const locked = !tutorComparisonUnlocked(paidRes.data?.paid_until ? String(paidRes.data.paid_until) : null);
  if (locked) {
    return NextResponse.json({
      data: {
        locked: true,
        monthlyPriceHkd: TUTOR_COMPARISON_MONTHLY_PRICE_HKD,
        gradeLabel,
        schoolName,
        district,
      },
    });
  }

  const members: ComparisonMember[] = (raw.members ?? []).map((member) => ({
    studentId: String(member.student_id ?? ""),
    schoolId: member.school_id ? String(member.school_id) : null,
    district: member.district ? String(member.district) : null,
    accuracy: member.accuracy === null || member.accuracy === undefined ? null : Number(member.accuracy),
  }));
  const comparison = buildPeerComparison({
    studentId: resolved.student.studentId,
    schoolId: raw.school_id ? String(raw.school_id) : null,
    district,
    members,
  });
  const selectedMembers: ComparisonMember[] = (raw.selected_members ?? []).map((member) => ({
    studentId: String(member.student_id ?? ""),
    schoolId: member.school_id ? String(member.school_id) : null,
    district: member.district ? String(member.district) : null,
    accuracy: member.accuracy === null || member.accuracy === undefined ? null : Number(member.accuracy),
  }));
  const selected =
    selectedGrade && selectedSchoolId
      ? compareWithSelectedGroup({
          studentId: resolved.student.studentId,
          studentAccuracy: comparison.studentAccuracy,
          members: selectedMembers,
        })
      : null;

  return NextResponse.json({
    data: {
      locked: false,
      monthlyPriceHkd: TUTOR_COMPARISON_MONTHLY_PRICE_HKD,
      gradeLabel,
      schoolName,
      district,
      comparison,
      selected,
      selectedGradeLabel: selectedGrade ? gradeDisplayLabel(selectedGrade) : "",
      selectedSchoolName: String(raw.selected_school_name ?? "").trim(),
    },
  });
}
