import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AI_QUESTION_SOURCE, isAiQuestionSource } from "@/lib/question-source";
import { quizSubjectDbPatterns } from "@/lib/quiz-subjects";
import {
  FREE_PRACTICE_PAPER_MONTHLY_LIMIT,
  PRACTICE_PAPER_QUESTION_COUNT,
  hktMonthKey,
  isPracticePaperSubject,
  pickPracticeQuestions,
  practicePaperQuotaError,
  type PracticePaperQuestion,
} from "@/lib/tutor-practice-paper";

export const TUTOR_PRACTICE_PAPER_TABLE_HINT =
  "缺少練習卷資料表，請先在 Supabase 執行 supabase_tutor_practice_papers.sql。";

export type PracticePaperRecord = {
  id: string;
  studentId: string;
  studentName: string;
  gradeLevel: string;
  subject: string;
  questions: PracticePaperQuestion[];
  monthKey: string;
  createdAt: string;
};

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

function isMissingTable(message: string): boolean {
  return /tutor_practice_papers|42P01|42703|does not exist/i.test(message);
}

function asQuestions(value: unknown): PracticePaperQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const item = row as Partial<PracticePaperQuestion>;
    return {
      id: String(item.id ?? ""),
      content: String(item.content ?? ""),
      opt_a: item.opt_a ? String(item.opt_a) : null,
      opt_b: item.opt_b ? String(item.opt_b) : null,
      opt_c: item.opt_c ? String(item.opt_c) : null,
      opt_d: item.opt_d ? String(item.opt_d) : null,
      correct_answer: String(item.correct_answer ?? ""),
      explanation: item.explanation ? String(item.explanation) : null,
      image_url: item.image_url ? String(item.image_url) : null,
    };
  });
}

function mapRow(row: {
  id?: string;
  student_id?: string;
  student_name?: string;
  grade_level?: string;
  subject?: string;
  questions?: unknown;
  month_key?: string;
  created_at?: string;
}): PracticePaperRecord {
  return {
    id: String(row.id ?? ""),
    studentId: String(row.student_id ?? ""),
    studentName: String(row.student_name ?? ""),
    gradeLevel: String(row.grade_level ?? ""),
    subject: String(row.subject ?? ""),
    questions: asQuestions(row.questions),
    monthKey: String(row.month_key ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

async function countMonthPapers(admin: SupabaseClient, codeId: string, monthKey: string): Promise<number> {
  const countRes = await admin
    .from("tutor_practice_papers")
    .select("id", { count: "exact", head: true })
    .eq("code_id", codeId)
    .eq("month_key", monthKey);
  if (countRes.error) {
    if (isMissingTable(countRes.error.message || "")) throw new Error(TUTOR_PRACTICE_PAPER_TABLE_HINT);
    throw countRes.error;
  }
  return Number(countRes.count ?? 0);
}

async function loadAiQuestions(
  admin: SupabaseClient,
  subjectKey: string,
  gradeLevel: string
): Promise<PracticePaperQuestion[]> {
  const patterns = quizSubjectDbPatterns(subjectKey);
  const collected: PracticePaperQuestion[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const query = admin
      .from("questions")
      .select("id,content,opt_a,opt_b,opt_c,opt_d,correct_answer,explanation,image_url,source,subject")
      .eq("grade_level", gradeLevel)
      .eq("source", AI_QUESTION_SOURCE)
      .or(patterns.map((pattern) => `subject.ilike.${pattern}`).join(","))
      .range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      if (!isAiQuestionSource(String(row.source ?? ""))) continue;
      collected.push({
        id: String(row.id ?? ""),
        content: String(row.content ?? ""),
        opt_a: row.opt_a ? String(row.opt_a) : null,
        opt_b: row.opt_b ? String(row.opt_b) : null,
        opt_c: row.opt_c ? String(row.opt_c) : null,
        opt_d: row.opt_d ? String(row.opt_d) : null,
        correct_answer: String(row.correct_answer ?? ""),
        explanation: row.explanation ? String(row.explanation) : null,
        image_url: row.image_url ? String(row.image_url) : null,
      });
    }
    if (rows.length < pageSize) break;
  }
  return collected.filter((question) => question.id && question.content.trim());
}

export async function listStudentPracticePapers({
  codeId,
  studentId,
}: {
  codeId: string;
  studentId: string;
}): Promise<
  | {
      ok: true;
      monthKey: string;
      used: number;
      limit: number;
      papers: PracticePaperRecord[];
    }
  | { ok: false; status: number; error: string }
> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, status: 503, error: "系統未配置 Supabase 管理金鑰。" };
  const monthKey = hktMonthKey();
  try {
    const used = await countMonthPapers(admin, codeId, monthKey);
    const listRes = await admin
      .from("tutor_practice_papers")
      .select("id,student_id,student_name,grade_level,subject,month_key,created_at")
      .eq("code_id", codeId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (listRes.error) {
      if (isMissingTable(listRes.error.message || "")) {
        return { ok: false, status: 503, error: TUTOR_PRACTICE_PAPER_TABLE_HINT };
      }
      throw listRes.error;
    }
    return {
      ok: true,
      monthKey,
      used,
      limit: FREE_PRACTICE_PAPER_MONTHLY_LIMIT,
      papers: (listRes.data ?? []).map((row) => mapRow(row)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === TUTOR_PRACTICE_PAPER_TABLE_HINT) return { ok: false, status: 503, error: message };
    throw error;
  }
}

export async function createPracticePaper({
  codeId,
  studentId,
  studentName,
  subject,
}: {
  codeId: string;
  studentId: string;
  studentName: string;
  subject: string;
}): Promise<
  | { ok: true; paper: PracticePaperRecord; used: number; limit: number }
  | { ok: false; status: number; error: string }
> {
  if (!isPracticePaperSubject(subject)) {
    return { ok: false, status: 400, error: "請選擇科目。" };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, status: 503, error: "系統未配置 Supabase 管理金鑰。" };

  const studentRes = await admin
    .from("students")
    .select("id,grade_level,student_name")
    .eq("id", studentId)
    .maybeSingle();
  if (studentRes.error) throw studentRes.error;
  if (!studentRes.data) return { ok: false, status: 404, error: "找不到該學生。" };
  const gradeLevel = String(studentRes.data.grade_level ?? "").trim();
  if (!gradeLevel) return { ok: false, status: 400, error: "這位學生尚未設定年級。" };

  const monthKey = hktMonthKey();
  let used = 0;
  try {
    used = await countMonthPapers(admin, codeId, monthKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === TUTOR_PRACTICE_PAPER_TABLE_HINT) return { ok: false, status: 503, error: message };
    throw error;
  }
  const quotaError = practicePaperQuotaError(used);
  if (quotaError) return { ok: false, status: 429, error: quotaError };

  const pool = await loadAiQuestions(admin, subject, gradeLevel);
  const picked = pickPracticeQuestions(pool, PRACTICE_PAPER_QUESTION_COUNT, Math.random);
  if (!picked) {
    return {
      ok: false,
      status: 400,
      error: `題庫不足：${gradeLevel} 目前只有 ${pool.length} 題，未能生成 ${PRACTICE_PAPER_QUESTION_COUNT} 題練習卷。`,
    };
  }

  const insertRes = await admin
    .from("tutor_practice_papers")
    .insert({
      code_id: codeId,
      student_id: studentId,
      student_name: String(studentRes.data.student_name ?? "").trim() || studentName,
      grade_level: gradeLevel,
      subject,
      questions: picked,
      month_key: monthKey,
    })
    .select("id,student_id,student_name,grade_level,subject,questions,month_key,created_at")
    .maybeSingle();
  if (insertRes.error) {
    if (isMissingTable(insertRes.error.message || "")) {
      return { ok: false, status: 503, error: TUTOR_PRACTICE_PAPER_TABLE_HINT };
    }
    throw insertRes.error;
  }
  if (!insertRes.data) return { ok: false, status: 500, error: "未能儲存練習卷。" };

  const usedAfter = await countMonthPapers(admin, codeId, monthKey);
  if (usedAfter > FREE_PRACTICE_PAPER_MONTHLY_LIMIT) {
    await admin.from("tutor_practice_papers").delete().eq("id", insertRes.data.id);
    return {
      ok: false,
      status: 429,
      error: practicePaperQuotaError(FREE_PRACTICE_PAPER_MONTHLY_LIMIT) || "本月已生成 4 份練習卷。",
    };
  }

  return {
    ok: true,
    paper: mapRow(insertRes.data),
    used: usedAfter,
    limit: FREE_PRACTICE_PAPER_MONTHLY_LIMIT,
  };
}

export async function getPracticePaperForTutor({
  codeId,
  paperId,
}: {
  codeId: string;
  paperId: string;
}): Promise<PracticePaperRecord | null> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("系統未配置 Supabase 管理金鑰。");
  const paperRes = await admin
    .from("tutor_practice_papers")
    .select("id,student_id,student_name,grade_level,subject,questions,month_key,created_at,code_id")
    .eq("id", paperId)
    .eq("code_id", codeId)
    .maybeSingle();
  if (paperRes.error) {
    if (isMissingTable(paperRes.error.message || "")) throw new Error(TUTOR_PRACTICE_PAPER_TABLE_HINT);
    throw paperRes.error;
  }
  if (!paperRes.data) return null;
  return mapRow(paperRes.data);
}
