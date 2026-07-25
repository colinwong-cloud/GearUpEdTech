import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const FREE_TIER_MONTHLY_CAP_ERROR = "本月免費題目額度已用完（200題）";
const MOBILE_SHARED_QUOTA_POLICY_VERSION = "mobile-shared-quota-v1";

type BonusSubmitPayload = {
  sessionId?: string;
  studentId?: string;
  questionId?: string;
  studentAnswer?: string;
  isCorrect?: boolean;
  questionOrder?: number;
};

type QuizSessionRow = {
  id: string;
  student_id: string | null;
  subject: string | null;
};

type StudentBalanceRow = {
  id: string;
  student_id: string | null;
  subject: string | null;
  remaining_questions: number | null;
};

type StudentParentRow = {
  parent_id: string | null;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

function logAntiMissingMobileSharedQuota(event: string, payload: Record<string, unknown>) {
  console.info(
    `[anti-missing][quota][mobile-shared] ${event} ${JSON.stringify({
      policy_version: MOBILE_SHARED_QUOTA_POLICY_VERSION,
      ...payload,
    })}`
  );
}

function normalizeQuestionOrder(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function POST(req: NextRequest) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel" },
      { status: 503 }
    );
  }

  let body: BonusSubmitPayload;
  try {
    body = (await req.json()) as BonusSubmitPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = String(body.sessionId || "").trim();
  const studentId = String(body.studentId || "").trim();
  const questionId = String(body.questionId || "").trim();
  const studentAnswer = String(body.studentAnswer || "");
  const isCorrect = body.isCorrect === true;
  const questionOrder = normalizeQuestionOrder(body.questionOrder);

  if (!sessionId || !studentId || !questionId || questionOrder == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const submitParams = {
    p_session_id: sessionId,
    p_question_id: questionId,
    p_student_answer: studentAnswer,
    p_is_correct: isCorrect,
    p_question_order: questionOrder,
  };

  const { error: submitErr } = await admin.rpc("submit_answer", submitParams);
  if (!submitErr) {
    return NextResponse.json({ ok: true, source: "submit_answer" });
  }

  const submitErrMessage = String(submitErr.message || "");
  if (!submitErrMessage.includes(FREE_TIER_MONTHLY_CAP_ERROR)) {
    return NextResponse.json({ error: submitErrMessage || "提交答案失敗。" }, { status: 400 });
  }

  const { data: sessionData, error: sessionErr } = await admin
    .from("quiz_sessions")
    .select("id,student_id,subject")
    .eq("id", sessionId)
    .maybeSingle<QuizSessionRow>();

  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message || "找不到練習紀錄" }, { status: 500 });
  }

  if (!sessionData?.student_id) {
    return NextResponse.json({ error: "找不到練習紀錄" }, { status: 404 });
  }

  if (sessionData.student_id !== studentId) {
    return NextResponse.json({ error: "學生資料不匹配，請重新登入。" }, { status: 400 });
  }

  const { data: practicingStudent, error: practicingStudentErr } = await admin
    .from("students")
    .select("parent_id")
    .eq("id", sessionData.student_id)
    .maybeSingle<StudentParentRow>();
  if (practicingStudentErr) {
    return NextResponse.json(
      { error: practicingStudentErr.message || "讀取學生資料失敗" },
      { status: 500 }
    );
  }
  if (!practicingStudent?.parent_id) {
    return NextResponse.json({ error: "找不到學生家長資料" }, { status: 404 });
  }

  const { data: parentStudentRows, error: parentStudentsErr } = await admin
    .from("students")
    .select("id")
    .eq("parent_id", practicingStudent.parent_id)
    .limit(2000);
  if (parentStudentsErr) {
    return NextResponse.json(
      { error: parentStudentsErr.message || "讀取家長學生資料失敗" },
      { status: 500 }
    );
  }
  const familyStudentIds = (parentStudentRows ?? [])
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
  if (!familyStudentIds.length) {
    return NextResponse.json({ error: "找不到同電話學生資料" }, { status: 404 });
  }

  const { data: balanceRows, error: balanceErr } = await admin
    .from("student_balances")
    .select("id,student_id,subject,remaining_questions")
    .in("student_id", familyStudentIds);

  if (balanceErr) {
    return NextResponse.json({ error: balanceErr.message || "讀取配額失敗" }, { status: 500 });
  }

  const candidates = ((balanceRows as StudentBalanceRow[] | null) ?? [])
    .filter((row) => Number(row.remaining_questions ?? 0) > 0)
    .sort((a, b) => (b.remaining_questions ?? 0) - (a.remaining_questions ?? 0));
  const ownCandidates = candidates.filter(
    (row) => String(row.student_id ?? "").trim() === sessionData.student_id
  );

  const targetBalance = ownCandidates[0] ?? candidates[0];
  const currentRemaining = Number(targetBalance?.remaining_questions ?? 0);
  if (!targetBalance || currentRemaining <= 0) {
    return NextResponse.json(
      { error: "你的練習題目已用完，請聯絡家長充值。" },
      { status: 400 }
    );
  }
  const familyTotalBefore = ((balanceRows as StudentBalanceRow[] | null) ?? []).reduce(
    (sum, row) => sum + Math.max(0, Number(row.remaining_questions ?? 0)),
    0
  );

  const { error: insertAnswerErr } = await admin.from("session_answers").insert({
    session_id: sessionId,
    question_id: questionId,
    student_answer: studentAnswer,
    is_correct: isCorrect,
    question_order: questionOrder,
  });
  if (insertAnswerErr) {
    return NextResponse.json({ error: insertAnswerErr.message || "提交答案失敗。" }, { status: 500 });
  }

  const nextRemaining = currentRemaining - 1;
  const { error: updateBalanceErr } = await admin
    .from("student_balances")
    .update({ remaining_questions: nextRemaining })
    .eq("id", targetBalance.id);
  if (updateBalanceErr) {
    return NextResponse.json({ error: updateBalanceErr.message || "更新配額失敗" }, { status: 500 });
  }

  const familyTotalAfter = Math.max(0, familyTotalBefore - 1);
  const txSubject = String(targetBalance.subject || sessionData.subject || "Math").trim();
  const { error: txErr } = await admin.from("balance_transactions").insert({
    student_id: sessionData.student_id,
    subject: txSubject,
    change_amount: -1,
    balance_after: familyTotalAfter,
    description: "ADMIN_QUOTA_USAGE",
    session_id: sessionId,
  });
  if (txErr) {
    console.error("submit-answer-bonus tx insert warning:", txErr.message);
  }
  logAntiMissingMobileSharedQuota("consume-shared-quota", {
    session_id: sessionId,
    student_id: sessionData.student_id,
    charged_balance_id: targetBalance.id,
    charged_balance_student_id: targetBalance.student_id,
    charged_balance_subject: txSubject,
    family_total_before: familyTotalBefore,
    family_total_after: familyTotalAfter,
  });

  return NextResponse.json({
    ok: true,
    source: "admin_quota_bonus",
    remaining_questions: familyTotalAfter,
    shared_pool: true,
    policy_version: MOBILE_SHARED_QUOTA_POLICY_VERSION,
  });
}
