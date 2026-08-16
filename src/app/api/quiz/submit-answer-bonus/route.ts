import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const FREE_TIER_MONTHLY_CAP_ERROR = "本月免費題目額度已用完（200題）";
const MOBILE_SHARED_QUOTA_POLICY_VERSION = "mobile-shared-quota-v1";
const INSUFFICIENT_BALANCE_ERROR_RE = /(餘額不足|配額不足|quota|insufficient)/i;
const BASE_MONTHLY_MOBILE_QUOTA = 200;
const TOPUP_DESCRIPTIONS = new Set(["管理員手動增加", "ADMIN_QUOTA_TOPUP"]);
const USAGE_DESCRIPTIONS_FOR_QUOTA = new Set([
  "FREE_TIER_USAGE",
  "ADMIN_QUOTA_USAGE",
  "練習作答扣除",
]);

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

type StudentParentRow = {
  parent_id: string | null;
};

type BalanceTransactionRow = {
  change_amount: number | null;
  description: string | null;
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

function getCurrentHktMonthRangeIso() {
  const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const now = new Date();
  const hktNow = new Date(now.getTime() + HKT_OFFSET_MS);
  const year = hktNow.getUTCFullYear();
  const month = hktNow.getUTCMonth();
  const monthStartUtcMs = Date.UTC(year, month, 1) - HKT_OFFSET_MS;
  const nextMonthStartUtcMs = Date.UTC(year, month + 1, 1) - HKT_OFFSET_MS;
  return {
    startIso: new Date(monthStartUtcMs).toISOString(),
    endIso: new Date(nextMonthStartUtcMs).toISOString(),
  };
}

function normalizeUsageSubject(raw: string | null): string {
  const value = String(raw || "").trim();
  if (!value) return "Math";
  return value.toLowerCase() === "math" ? "Math" : value;
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
  const fallbackReason = submitErrMessage.includes(FREE_TIER_MONTHLY_CAP_ERROR)
    ? "free-tier-monthly-cap"
    : INSUFFICIENT_BALANCE_ERROR_RE.test(submitErrMessage)
      ? "insufficient-subject-balance"
      : null;
  if (!fallbackReason) {
    return NextResponse.json({ error: submitErrMessage || "提交答案失敗。" }, { status: 400 });
  }
  logAntiMissingMobileSharedQuota("submit-answer-shared-fallback-triggered", {
    session_id: sessionId,
    student_id: studentId,
    reason: fallbackReason,
    submit_error_message: submitErrMessage,
  });

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

  const { data: parentRow, error: parentErr } = await admin
    .from("parents")
    .select("mobile_number")
    .eq("id", practicingStudent.parent_id)
    .maybeSingle();
  if (parentErr) {
    return NextResponse.json({ error: parentErr.message || "讀取家長資料失敗" }, { status: 500 });
  }
  const mobileNumber = String(parentRow?.mobile_number || "").trim();
  if (!mobileNumber) {
    return NextResponse.json({ error: "找不到家長電話資料" }, { status: 404 });
  }

  const { data: tierData, error: tierErr } = await admin.rpc("get_parent_tier_status", {
    p_mobile: mobileNumber,
  });
  if (tierErr) {
    return NextResponse.json({ error: tierErr.message || "讀取家長會員狀態失敗" }, { status: 500 });
  }
  const isPaidTier = Boolean((tierData as { is_paid?: boolean } | null)?.is_paid);

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

  const { startIso, endIso } = getCurrentHktMonthRangeIso();
  let topupInMonth = 0;
  let usageInMonth = 0;
  if (!isPaidTier) {
    const { data: monthlyRows, error: monthlyErr } = await admin
      .from("balance_transactions")
      .select("change_amount,description")
      .in("student_id", familyStudentIds)
      .gte("created_at", startIso)
      .lt("created_at", endIso);
    if (monthlyErr) {
      return NextResponse.json({ error: monthlyErr.message || "讀取月度配額失敗" }, { status: 500 });
    }
    for (const row of (monthlyRows as BalanceTransactionRow[] | null) ?? []) {
      const description = String(row.description || "").trim();
      const change = Number(row.change_amount ?? 0);
      if (!description || !Number.isFinite(change)) continue;
      if (TOPUP_DESCRIPTIONS.has(description) && change > 0) {
        topupInMonth += change;
      }
      if (USAGE_DESCRIPTIONS_FOR_QUOTA.has(description) && change < 0) {
        usageInMonth += Math.abs(change);
      }
    }
  }

  const allowance = BASE_MONTHLY_MOBILE_QUOTA + topupInMonth;
  const familyTotalBefore = isPaidTier ? -1 : Math.max(allowance - usageInMonth, 0);
  if (!isPaidTier && familyTotalBefore <= 0) {
    return NextResponse.json({ error: "你的免費練習題目額度已用完，請聯絡家長升級成為月費用戶以繼續使用。" }, { status: 400 });
  }

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
  const familyTotalAfter = isPaidTier ? -1 : Math.max(familyTotalBefore - 1, 0);
  const txSubject = normalizeUsageSubject(sessionData.subject);
  const txDescription = isPaidTier ? "PAID_TIER_USAGE" : "ADMIN_QUOTA_USAGE";
  const { error: txErr } = await admin.from("balance_transactions").insert({
    student_id: sessionData.student_id,
    subject: txSubject,
    change_amount: -1,
    balance_after: familyTotalAfter,
    description: txDescription,
    session_id: sessionId,
  });
  if (txErr) {
    console.error("submit-answer-bonus tx insert warning:", txErr.message);
  }
  logAntiMissingMobileSharedQuota("consume-shared-quota", {
    session_id: sessionId,
    student_id: sessionData.student_id,
    charged_balance_subject: txSubject,
    tier_is_paid: isPaidTier,
    monthly_topped_up: topupInMonth,
    monthly_used_before: usageInMonth,
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
