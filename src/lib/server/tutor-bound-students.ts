import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeTutorStudentScopeHash,
  tutorHashesEqual,
} from "@/lib/server/tutor-student-hash";

export type TutorBoundStudent = {
  studentId: string;
  studentName: string;
  registeredMobile: string;
  linkedAt: string;
};

function chunkArray<T>(values: T[], size: number): T[][] {
  if (!Number.isFinite(size) || size <= 0) return [values];
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

export function findBoundStudentByHash(
  students: TutorBoundStudent[],
  hash: string,
  secret: string
): TutorBoundStudent | null {
  const target = String(hash ?? "").trim();
  if (!target) return null;
  for (const student of students) {
    const candidate = computeTutorStudentScopeHash(
      student.registeredMobile,
      student.studentId,
      secret
    );
    if (tutorHashesEqual(candidate, target)) return student;
  }
  return null;
}

export async function listTutorBoundStudents(
  admin: SupabaseClient,
  codeId: string,
  mobileKeyword = ""
): Promise<{ students: TutorBoundStudent[] } | { error: string; status: number }> {
  const usageRes = await admin
    .from("tutor_referral_usages")
    .select("mobile_number,used_at")
    .eq("code_id", codeId)
    .order("used_at", { ascending: false })
    .limit(10000);
  if (usageRes.error) {
    return { error: usageRes.error.message || "無法載入學生清單。", status: 500 };
  }

  const linkedAtByMobile = new Map<string, string>();
  for (const row of usageRes.data ?? []) {
    const mobile = String(row.mobile_number ?? "").trim();
    if (!mobile) continue;
    if (!linkedAtByMobile.has(mobile)) {
      linkedAtByMobile.set(mobile, row.used_at ? String(row.used_at) : "");
    }
  }

  const keyword = String(mobileKeyword ?? "").trim();
  const linkedMobiles = Array.from(linkedAtByMobile.keys())
    .filter((mobile) => (keyword ? mobile.includes(keyword) : true))
    .sort((a, b) => a.localeCompare(b));

  if (linkedMobiles.length === 0) {
    return { students: [] };
  }

  const parentIdByMobile = new Map<string, string>();
  const mobileByParentId = new Map<string, string>();
  for (const chunk of chunkArray(linkedMobiles, 500)) {
    const parentRes = await admin
      .from("parents")
      .select("id,mobile_number")
      .in("mobile_number", chunk)
      .limit(5000);
    if (parentRes.error) {
      return { error: parentRes.error.message || "無法讀取家長資料。", status: 500 };
    }
    for (const parentRow of parentRes.data ?? []) {
      const parentId = String(parentRow.id ?? "").trim();
      const mobile = String(parentRow.mobile_number ?? "").trim();
      if (!parentId || !mobile) continue;
      parentIdByMobile.set(mobile, parentId);
      mobileByParentId.set(parentId, mobile);
    }
  }

  const parentIds = Array.from(mobileByParentId.keys());
  const students: TutorBoundStudent[] = [];
  for (const chunk of chunkArray(parentIds, 500)) {
    const studentRes = await admin
      .from("students")
      .select("id,parent_id,student_name")
      .in("parent_id", chunk)
      .limit(10000);
    if (studentRes.error) {
      return { error: studentRes.error.message || "無法讀取學生資料。", status: 500 };
    }
    for (const studentRow of studentRes.data ?? []) {
      const studentId = String(studentRow.id ?? "").trim();
      const parentId = String(studentRow.parent_id ?? "").trim();
      if (!studentId || !parentId) continue;
      const mobile = mobileByParentId.get(parentId);
      if (!mobile) continue;
      students.push({
        studentId,
        studentName: String(studentRow.student_name ?? "").trim() || "學生",
        registeredMobile: mobile,
        linkedAt: linkedAtByMobile.get(mobile) || "",
      });
    }
  }

  return { students };
}

export async function resolveTutorBoundStudentFromHash(
  admin: SupabaseClient,
  codeId: string,
  hash: string,
  secret: string
): Promise<
  { student: TutorBoundStudent } | { error: string; status: number }
> {
  const listed = await listTutorBoundStudents(admin, codeId);
  if ("error" in listed) return listed;
  const student = findBoundStudentByHash(listed.students, hash, secret);
  if (!student) {
    return {
      error: "找不到該學生，或連結已失效。請返回導師主頁重新選擇。",
      status: 403,
    };
  }
  return { student };
}
