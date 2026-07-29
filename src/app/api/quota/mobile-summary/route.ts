import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CHINESE_QUIZ_SUBJECT,
  ENGLISH_QUIZ_SUBJECT,
  LEGACY_PRIMARY_QUIZ_SUBJECT_KEY,
} from "@/lib/quiz-subjects";

const BASE_MONTHLY_MOBILE_QUOTA = 200;
const TOPUP_DESCRIPTIONS = new Set(["管理員手動增加", "ADMIN_QUOTA_TOPUP"]);
const USAGE_DESCRIPTIONS_FOR_QUOTA = new Set([
  "FREE_TIER_USAGE",
  "ADMIN_QUOTA_USAGE",
  "練習作答扣除",
]);
const USAGE_DESCRIPTIONS_FOR_RECORD = new Set([
  ...USAGE_DESCRIPTIONS_FOR_QUOTA,
  "PAID_TIER_USAGE",
]);
const QUOTA_RELEVANT_DESCRIPTIONS = Array.from(
  new Set([...TOPUP_DESCRIPTIONS, ...USAGE_DESCRIPTIONS_FOR_RECORD])
);

type QuotaRequestBody = {
  mobile_number?: string;
  year?: number;
  month?: number;
  subject?: string;
};

type SubjectFilter = "all" | "math" | "chinese" | "english";

type StudentRow = {
  id: string;
  student_name: string | null;
};

type TxRow = {
  id: string;
  student_id: string | null;
  subject: string | null;
  change_amount: number | null;
  description: string | null;
  created_at: string | null;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeSubjectFilter(raw: string | undefined): SubjectFilter {
  const value = String(raw || "all").trim().toLowerCase();
  if (!value || value === "all") return "all";
  if (value === "math" || value === LEGACY_PRIMARY_QUIZ_SUBJECT_KEY.toLowerCase()) return "math";
  if (value === "chinese" || value === "中文") return "chinese";
  if (value === "english" || value === "英文") return "english";
  return "all";
}

function normalizeSubjectToken(raw: string | null): string {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  if (value === LEGACY_PRIMARY_QUIZ_SUBJECT_KEY.toLowerCase()) return "math";
  return value;
}

function matchesSubjectFilter(subject: string | null, filter: SubjectFilter): boolean {
  if (filter === "all") return true;
  const token = normalizeSubjectToken(subject);
  if (!token) return false;
  if (filter === "math") return token === "math";
  if (filter === "chinese") {
    return token === CHINESE_QUIZ_SUBJECT.toLowerCase() || token === "中文";
  }
  return token === ENGLISH_QUIZ_SUBJECT.toLowerCase() || token === "英文";
}

function toHktDateKey(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const hktDate = new Date(date.getTime() + HKT_OFFSET_MS);
  const year = hktDate.getUTCFullYear();
  const month = String(hktDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(hktDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeMonthInput(
  year: number | undefined,
  month: number | undefined
): { year: number; month: number } {
  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number(year) >= 2000 &&
    Number(month) >= 1 &&
    Number(month) <= 12
  ) {
    return { year: Number(year), month: Number(month) };
  }
  const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const now = new Date();
  const hktNow = new Date(now.getTime() + HKT_OFFSET_MS);
  return { year: hktNow.getUTCFullYear(), month: hktNow.getUTCMonth() + 1 };
}

function getHktMonthRangeIso(year: number, month: number): { startIso: string; endIso: string } {
  const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const monthStartUtcMs = Date.UTC(year, month - 1, 1) - HKT_OFFSET_MS;
  const nextMonthStartUtcMs = Date.UTC(year, month, 1) - HKT_OFFSET_MS;
  return {
    startIso: new Date(monthStartUtcMs).toISOString(),
    endIso: new Date(nextMonthStartUtcMs).toISOString(),
  };
}

export async function POST(req: NextRequest) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel" },
      { status: 503 }
    );
  }

  let body: QuotaRequestBody;
  try {
    body = (await req.json()) as QuotaRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mobile = String(body.mobile_number || "").trim();
  if (!mobile) {
    return NextResponse.json({ error: "Missing mobile_number" }, { status: 400 });
  }

  const subjectFilter = normalizeSubjectFilter(body.subject);
  const { year, month } = normalizeMonthInput(body.year, body.month);
  const { startIso, endIso } = getHktMonthRangeIso(year, month);

  const { data: parent, error: parentErr } = await admin
    .from("parents")
    .select("id,mobile_number")
    .eq("mobile_number", mobile)
    .maybeSingle();
  if (parentErr) {
    return NextResponse.json({ error: parentErr.message || "查詢家長失敗" }, { status: 500 });
  }
  if (!parent?.id) {
    return NextResponse.json({ error: "找不到此電話號碼" }, { status: 404 });
  }

  const { data: students, error: studentsErr } = await admin
    .from("students")
    .select("id,student_name")
    .eq("parent_id", parent.id)
    .limit(2000);
  if (studentsErr) {
    return NextResponse.json({ error: studentsErr.message || "查詢學生失敗" }, { status: 500 });
  }
  const studentRows = (students as StudentRow[] | null) ?? [];
  const studentIds = studentRows.map((row) => row.id).filter(Boolean);
  const studentNameMap = new Map(
    studentRows.map((row) => [row.id, String(row.student_name || "").trim() || "—"])
  );

  const { data: tierData, error: tierErr } = await admin.rpc("get_parent_tier_status", {
    p_mobile: mobile,
  });
  if (tierErr) {
    return NextResponse.json(
      { error: tierErr.message || "查詢會員狀態失敗" },
      { status: 500 }
    );
  }
  const isPaid = Boolean((tierData as { is_paid?: boolean } | null)?.is_paid);

  let txRows: TxRow[] = [];
  if (studentIds.length > 0) {
    const { data: txData, error: txErr } = await admin
      .from("balance_transactions")
      .select("id,student_id,subject,change_amount,description,created_at")
      .in("student_id", studentIds)
      .in("description", QUOTA_RELEVANT_DESCRIPTIONS)
      .gte("created_at", startIso)
      .lt("created_at", endIso);
    if (txErr) {
      return NextResponse.json({ error: txErr.message || "查詢配額紀錄失敗" }, { status: 500 });
    }
    txRows = (txData as TxRow[] | null) ?? [];
  }

  let monthlyTopup = 0;
  let monthlyUsageForQuota = 0;
  for (const row of txRows) {
    const description = String(row.description || "").trim();
    const change = Number(row.change_amount ?? 0);
    if (!description || !Number.isFinite(change)) continue;
    if (TOPUP_DESCRIPTIONS.has(description) && change > 0) {
      monthlyTopup += change;
    }
    if (USAGE_DESCRIPTIONS_FOR_QUOTA.has(description) && change < 0) {
      monthlyUsageForQuota += Math.abs(change);
    }
  }

  const openingBalance = isPaid ? -1 : BASE_MONTHLY_MOBILE_QUOTA;
  const allowance = BASE_MONTHLY_MOBILE_QUOTA + monthlyTopup;
  const totalBalance = isPaid ? -1 : Math.max(allowance - monthlyUsageForQuota, 0);

  const grouped = new Map<
    string,
    { id: string; date: string; student_name: string; questions_practiced: number }
  >();

  for (const row of txRows) {
    const description = String(row.description || "").trim();
    if (!USAGE_DESCRIPTIONS_FOR_RECORD.has(description)) continue;
    if (!matchesSubjectFilter(row.subject, subjectFilter)) continue;
    const change = Number(row.change_amount ?? 0);
    if (!Number.isFinite(change) || change >= 0) continue;
    const dateKey = toHktDateKey(row.created_at);
    const studentId = String(row.student_id || "").trim();
    if (!dateKey || !studentId) continue;
    const questions = Math.max(1, Math.round(Math.abs(change)));
    const groupKey = `${dateKey}|${studentId}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.questions_practiced += questions;
      continue;
    }
    grouped.set(groupKey, {
      id: groupKey,
      date: dateKey,
      student_name: studentNameMap.get(studentId) || "—",
      questions_practiced: questions,
    });
  }

  const records = [...grouped.values()].sort((a, b) => {
    if (a.date === b.date) return a.student_name.localeCompare(b.student_name);
    return a.date < b.date ? 1 : -1;
  });

  return NextResponse.json({
    data: {
      is_paid: isPaid,
      total_balance: totalBalance,
      opening_balance: openingBalance,
      records,
      month: `${year}-${String(month).padStart(2, "0")}`,
      subject: subjectFilter === "all" ? "ALL" : subjectFilter.toUpperCase(),
      monthly_topup: monthlyTopup,
      monthly_usage: monthlyUsageForQuota,
    },
  });
}
