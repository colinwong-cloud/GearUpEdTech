"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Script from "next/script";
import { Turnstile } from "@marsidev/react-turnstile";
import { supabase } from "@/lib/supabase";

const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const ReferenceLine = dynamic(() => import("recharts").then((m) => m.ReferenceLine), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });
import type {
  Student,
  Question,
  AnswerRecord,
  ParentWeight,
  StudentBalance,
} from "@/lib/types";
import {
  PRIMARY_QUIZ_SUBJECT,
  STUDENT_SUBJECT_OPTIONS,
  quizSubjectDbPatterns,
  subjectDisplayLabel,
} from "@/lib/quiz-subjects";
import { getPrivacyStatementTxtUrl } from "@/lib/privacy-statement";
import {
  buildSessionPracticeSummary,
  buildSessionPracticeSummaryForParent,
} from "@/lib/session-practice-summary";
import {
  StudentQuizExperience,
  getQuizSoundEnabled,
  setQuizSoundEnabled,
  playClickSound,
} from "@/components/student-quiz-experience";
import { QuestionContentParagraphs } from "@/components/question-content-paragraphs";
const MAX_SHORT_ANSWER = 2;
const MAX_IMAGE = 1;
const SUPABASE_PAGE_SIZE = 1000;
const STORAGE_BUCKET = "question-images";
const STORAGE_PATH_RE = /\/storage\/v1\/object\/public\/question-images\/(.+)$/;
const MONTHLY_PAID_PRICE_HKD = 99;
const AIRWALLEX_SDK_SRC = "https://static.airwallex.com/components/sdk/v1/index.js";

type AirwallexPaymentsApi = {
  redirectToCheckout: (props: Record<string, unknown>) => void;
};

type AirwallexSdkLike = {
  init?: (opts: {
    env: "demo" | "prod";
    enabledElements: string[];
  }) => Promise<{ payments?: AirwallexPaymentsApi } | void> | { payments?: AirwallexPaymentsApi } | void;
  payments?: AirwallexPaymentsApi;
  createElement?: (name: string) => unknown;
  redirectToCheckout?: (props: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    Airwallex?: AirwallexSdkLike;
    AirwallexComponentsSDK?: AirwallexSdkLike;
    _AirwallexSDKs?: {
      payment?: AirwallexSdkLike;
    };
  }
}

function getRankSampleImageUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RANK_SAMPLE_IMAGE_URL?.trim();
  if (explicit) return explicit;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return base
    ? `${base}/storage/v1/object/public/Webpage_images/logo/rank_sample.png`
    : "/rank_sample.png";
}

function getPaymentTermsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_PAYMENT_TERMS_URL?.trim();
  if (explicit) return explicit;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return base
    ? `${base}/storage/v1/object/public/Webpage_statements/payment_terms_condition.txt`
    : "/payment_terms_condition.txt";
}

function getAirwallexEnv(): "demo" | "prod" {
  const env = (process.env.NEXT_PUBLIC_AIRWALLEX_ENV || "").trim().toLowerCase();
  if (env === "demo" || env === "sandbox" || env === "test") return "demo";
  return "prod";
}

async function resolveAirwallexPaymentsApi(
  env: "demo" | "prod"
): Promise<AirwallexPaymentsApi> {
  const sdk =
    typeof window !== "undefined"
      ? window.AirwallexComponentsSDK ||
        window._AirwallexSDKs?.payment ||
        window.Airwallex
      : undefined;
  if (!sdk) {
    throw new Error("付款 SDK 尚未準備好，請稍候再試。");
  }

  if (typeof sdk.redirectToCheckout === "function") {
    return {
      redirectToCheckout: (props) => sdk.redirectToCheckout!(props),
    };
  }

  let payments: AirwallexPaymentsApi | undefined;
  if (typeof sdk.init === "function") {
    const initResult = await sdk.init({
      env,
      enabledElements: ["payments"],
    });
    const maybeResult =
      initResult && typeof initResult === "object"
        ? (initResult as { payments?: AirwallexPaymentsApi })
        : null;
    payments = maybeResult?.payments;
  }

  if (!payments && sdk.payments) {
    payments = sdk.payments;
  }

  if (!payments && typeof sdk.createElement === "function") {
    const maybePayments = sdk.createElement("payments") as AirwallexPaymentsApi | undefined;
    if (maybePayments && typeof maybePayments.redirectToCheckout === "function") {
      payments = maybePayments;
    }
  }

  if (!payments || typeof payments.redirectToCheckout !== "function") {
    throw new Error("付款 SDK 初始化失敗，請重新整理後再試。");
  }
  return payments;
}

function hasAirwallexSdk(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.AirwallexComponentsSDK ||
      window._AirwallexSDKs?.payment ||
      window.Airwallex
  );
}

function ensureAirwallexScript(): void {
  if (typeof document === "undefined") return;
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${AIRWALLEX_SDK_SRC}"]`
  );
  if (existing) return;
  const script = document.createElement("script");
  script.src = AIRWALLEX_SDK_SRC;
  script.async = true;
  script.setAttribute("data-airwallex-sdk", "true");
  document.head.appendChild(script);
}

async function waitForAirwallexSdkReady(timeoutMs = 10000): Promise<boolean> {
  if (hasAirwallexSdk()) return true;
  ensureAirwallexScript();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (hasAirwallexSdk()) return true;
  }
  return hasAirwallexSdk();
}

function normalizeTurnstileErrorCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  return trimmed || null;
}

type AppScreen =
  | "login_mobile"
  | "register"
  | "login_role"
  | "login_student"
  | "subject_select"
  | "question_count_select"
  | "quiz"
  | "results"
  | "parent_dashboard"
  | "parent_session_detail"
  | "account_menu"
  | "balance_view"
  | "profile_edit"
  | "add_student_form"
  | "parent_student_select"
  | "forgot_password"
  | "payment";

const QUESTION_COUNT_OPTIONS = [10, 20, 30] as const;

interface SessionSummary {
  id: string;
  subject: string;
  questions_attempted: number;
  score: number;
  time_spent_seconds: number;
  created_at: string;
}

interface SessionDetailAnswer {
  student_answer: string;
  is_correct: boolean;
  question_order: number | null;
  question: Question;
}

interface ChartSession {
  id: string;
  created_at: string;
  questions_attempted: number;
  score: number;
  correct_pct: number;
}

interface ChartTypeSession {
  question_type: string;
  session_id: string;
  created_at: string;
  total: number;
  correct: number;
  correct_pct: number;
}

interface GradeAverage {
  question_type: string;
  avg_correct_pct: number;
  total_sessions: number;
}

interface ChartDataPayload {
  grade_level: string;
  sessions: ChartSession[];
  type_sessions: ChartTypeSession[];
  grade_averages: GradeAverage[];
}

/** Nightly cache from student_grade_rankings; see get_parent_student_grade_rank RPC */
interface ParentGradeRankPayload {
  has_snapshot: boolean;
  error?: string;
  /** Canonical subject key (Math / Chinese / English) when snapshot exists */
  subject?: string;
  calculated_at?: string;
  grade_level?: string;
  student_id?: string;
  student_name?: string;
  lifetime_questions?: number;
  session_count_in_avg?: number;
  last_10_avg_correct_pct?: number;
  rank_in_grade?: number | null;
  total_eligible_in_grade?: number;
  is_eligible?: boolean;
}

interface BalanceTransaction {
  id: string;
  change_amount: number;
  balance_after: number | null;
  description: string;
  session_id: string | null;
  created_at: string;
}

interface ParentBalanceView {
  total_balance: number;
  opening_balance: number;
  transactions: (BalanceTransaction & { student_name: string })[];
}

interface GroupedBalanceTransaction {
  id: string;
  date: string;
  student_name: string;
  description: string;
  change_amount: number;
  balance_after: number | null;
}

type ParentTier = "free" | "paid";

interface ParentTierStatus {
  tier: ParentTier;
  is_paid: boolean;
  paid_until?: string | null;
  tier_label: string;
}

interface DiscountValidationResult {
  valid: boolean;
  code: string | null;
  discount_percent: number;
  salesperson: string | null;
}

function isShortAnswer(q: Question): boolean {
  return q.opt_a == null && q.opt_b == null && q.opt_c == null && q.opt_d == null;
}

function hasImage(q: Question): boolean {
  return q.image_url != null && q.image_url.trim() !== "";
}

function getImagePublicUrl(q: Question): string | null {
  if (!q.image_url) return null;
  const match = q.image_url.match(STORAGE_PATH_RE);
  if (!match) return q.image_url;
  const path = decodeURIComponent(match[1]);
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function fetchAllQuestions(
  subject: string,
  gradeLevel: string
): Promise<Question[]> {
  const subjectPatterns = quizSubjectDbPatterns(subject);
  const all: Question[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .ilikeAnyOf("subject", subjectPatterns)
      .eq("grade_level", gradeLevel)
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Question[]));
    if (data.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return all;
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function selectQuestions(
  all: Question[],
  weights: ParentWeight[],
  count: number
): Question[] {
  let pool = all;

  if (weights.length > 0) {
    const activeTypes = weights.filter((w) => w.weight_percentage > 0);
    if (activeTypes.length > 0) {
      const totalWeight = activeTypes.reduce(
        (s, w) => s + w.weight_percentage,
        0
      );
      const buckets: Question[][] = activeTypes.map((w) =>
        fisherYatesShuffle(
          all.filter(
            (q) => q.question_type.toLowerCase() === w.question_type.toLowerCase()
          )
        )
      );
      const selected: Question[] = [];
      const usedIds = new Set<string>();

      for (let wi = 0; wi < activeTypes.length; wi++) {
        const quota = Math.max(
          1,
          Math.round(
            (activeTypes[wi].weight_percentage / totalWeight) * count
          )
        );
        let picked = 0;
        for (const q of buckets[wi]) {
          if (picked >= quota || selected.length >= count) break;
          if (!usedIds.has(q.id)) {
            selected.push(q);
            usedIds.add(q.id);
            picked++;
          }
        }
      }

      if (selected.length < count) {
        const remainder = fisherYatesShuffle(
          all.filter((q) => !usedIds.has(q.id))
        );
        for (const q of remainder) {
          if (selected.length >= count) break;
          selected.push(q);
        }
      }

      pool = selected.slice(0, count);
      return applySpecialLimits(pool, all, count);
    }
  }

  return applySpecialLimits(fisherYatesShuffle(pool), all, count);
}

function applySpecialLimits(candidates: Question[], fullPool: Question[], count: number): Question[] {
  const result: Question[] = [];
  const usedIds = new Set<string>();
  let shortCount = 0;
  let imageCount = 0;

  for (const q of candidates) {
    if (result.length >= count) break;
    const sa = isShortAnswer(q);
    const img = hasImage(q);
    if (sa && shortCount >= MAX_SHORT_ANSWER) continue;
    if (img && imageCount >= MAX_IMAGE) continue;
    result.push(q);
    usedIds.add(q.id);
    if (sa) shortCount++;
    if (img) imageCount++;
  }

  if (result.length < count) {
    const extras = fisherYatesShuffle(
      fullPool.filter(
        (q) =>
          !usedIds.has(q.id) && !isShortAnswer(q) && !hasImage(q)
      )
    );
    for (const q of extras) {
      if (result.length >= count) break;
      result.push(q);
    }
  }

  return fisherYatesShuffle(result);
}

function preventContextMenu(e: React.MouseEvent) {
  e.preventDefault();
}

function preventQuizClipboard(e: React.ClipboardEvent) {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.type === "text") {
    return;
  }
  e.preventDefault();
}

function preventQuizDragStart(e: React.DragEvent) {
  e.preventDefault();
}

export default function QuizApp() {
  const [screen, setScreen] = useState<AppScreen>("login_mobile");
  const [mobileNumber, setMobileNumber] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [balance, setBalance] = useState<StudentBalance | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [textAnswer, setTextAnswer] = useState("");
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const [showSpeedReminder, setShowSpeedReminder] = useState(false);
  const speedReminderShownRef = useRef(false);
  const answerTimestampsRef = useRef<number[]>([]);
  const [quizTransition, setQuizTransition] = useState(0);
  const [encourageIndex, setEncourageIndex] = useState(0);
  const [quizSoundOn, setQuizSoundOn] = useState(true);
  const [sessionPracticeSummary, setSessionPracticeSummary] = useState<string | null>(null);
  useEffect(() => {
    setQuizSoundOn(getQuizSoundEnabled());
  }, []);

  const [parentSessions, setParentSessions] = useState<SessionSummary[]>([]);
  const [parentMonth, setParentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [parentSubject, setParentSubject] = useState(PRIMARY_QUIZ_SUBJECT);
  const [parentDetailSession, setParentDetailSession] = useState<SessionSummary | null>(null);
  const [parentDetailAnswers, setParentDetailAnswers] = useState<SessionDetailAnswer[]>([]);
  
  const [chartData, setChartData] = useState<ChartDataPayload | null>(null);
  const [gradeRank, setGradeRank] = useState<ParentGradeRankPayload | null>(null);
  const [parentTierStatus, setParentTierStatus] = useState<ParentTierStatus>({
    tier: "free",
    is_paid: false,
    paid_until: null,
    tier_label: "免費用戶",
  });

  const refreshParentTierStatus = useCallback(async () => {
    const mobile = mobileNumber.trim();
    if (!mobile) {
      setParentTierStatus({
        tier: "free",
        is_paid: false,
        paid_until: null,
        tier_label: "免費用戶",
      });
      return;
    }
    try {
      const { data, error: rpcErr } = await supabase.rpc("get_parent_tier_status", {
        p_mobile: mobile,
      });
      if (rpcErr) throw rpcErr;
      const result = data as ParentTierStatus | null;
      if (result) {
        setParentTierStatus({
          tier: result.tier === "paid" ? "paid" : "free",
          is_paid: Boolean(result.is_paid),
          paid_until: result.paid_until ?? null,
          tier_label: result.tier_label || (result.is_paid ? "月費用戶" : "免費用戶"),
        });
      }
    } catch {
      setParentTierStatus({
        tier: "free",
        is_paid: false,
        paid_until: null,
        tier_label: "免費用戶",
      });
    }
  }, [mobileNumber]);

  const handleMobileSubmit = useCallback(async () => {
    if (!mobileNumber.trim() || !pinInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mobile-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: mobileNumber.trim(),
          pin: pinInput.trim(),
        }),
      });
      const result = (await res.json()) as {
        parent_found?: boolean;
        students?: Student[];
        tier?: ParentTier;
        is_paid?: boolean;
        paid_until?: string | null;
        tier_label?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(result.error || "登入失敗，請重試。");
      }
      if (!result.parent_found)
        throw new Error("找不到此電話號碼的帳戶，請先註冊。");
      if (!result.students || result.students.length === 0)
        throw new Error("密碼不正確，請重試。");

      setStudents(result.students);
      setParentTierStatus({
        tier: result.tier === "paid" ? "paid" : "free",
        is_paid: Boolean(result.is_paid),
        paid_until: result.paid_until ?? null,
        tier_label:
          result.tier_label ||
          (result.tier === "paid" || result.is_paid ? "月費用戶" : "免費用戶"),
      });
      setScreen("login_role");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗，請重試。");
    } finally {
      setLoading(false);
    }
  }, [mobileNumber, pinInput]);

  const handleRegister = useCallback(
    async (form: {
      studentName: string;
      pinCode: string;
      avatarStyle: string;
      gradeLevel: string;
      email: string;
      schoolId: string | null;
    }) => {
      if (!mobileNumber.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcErr } = await supabase.rpc("register_student", {
          p_mobile_number: mobileNumber.trim(),
          p_student_name: form.studentName,
          p_pin_code: form.pinCode,
          p_avatar_style: form.avatarStyle,
          p_grade_level: form.gradeLevel,
          p_email: form.email || null,
          p_school_id: form.schoolId,
        });
        if (rpcErr) throw rpcErr;

        setSelectedStudent(data as Student);
        setStudents([data as Student]);
        await refreshParentTierStatus();
        setScreen("subject_select");
      } catch (err) {
        setError(err instanceof Error ? err.message : "註冊失敗，請重試。");
      } finally {
        setLoading(false);
      }
    },
    [mobileNumber, refreshParentTierStatus]
  );

  const handleStudentSelect = useCallback((student: Student) => {
    setSelectedStudent(student);
    setScreen("subject_select");
  }, []);

  const handleAddStudentSubmit = useCallback(
    async (form: { studentName: string; avatarStyle: string; gradeLevel: string; schoolId: string | null }) => {
      if (!mobileNumber.trim()) return;
      if (!pinInput.trim()) {
        setError("登入狀態已失效，請重新登入後再試。");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcErr } = await supabase.rpc("add_student_to_parent", {
          p_mobile_number: mobileNumber.trim(),
          p_student_name: form.studentName,
          p_pin_code: pinInput.trim(),
          p_avatar_style: form.avatarStyle,
          p_grade_level: form.gradeLevel,
          p_school_id: form.schoolId,
        });
        if (rpcErr) throw rpcErr;
        if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
        const newStudent = data as Student;
        setStudents((prev) => [...prev, newStudent]);
        await refreshParentTierStatus();
        setScreen("account_menu");
      } catch (err) {
        const fallbackError = "新增學生失敗，請重試。";
        const rawMessage = err instanceof Error ? err.message : fallbackError;
        const isDuplicateGradeError = /每個年級只可新增一位學生|同年級|same grade/i.test(rawMessage);
        setError(
          isDuplicateGradeError
            ? "因系統紀錄已有同年級學生而未能添加，如有查詢，請電郵至 cs@hkedutech.com"
            : rawMessage
        );
      } finally {
        setLoading(false);
      }
    },
    [mobileNumber, pinInput, refreshParentTierStatus]
  );

  const loadParentSessions = async (
    studentId: string,
    subject: string,
    year: number,
    month: number
  ) => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, chartRes, rankRes] = await Promise.all([
        supabase.rpc("get_parent_sessions", {
          p_student_id: studentId,
          p_subject: subject,
          p_year: year,
          p_month: month,
        }),
        supabase.rpc("get_student_chart_data", {
          p_student_id: studentId,
          p_subject: subject,
        }),
        supabase.rpc("get_parent_student_grade_rank", {
          p_student_id: studentId,
          p_subject: subject,
        }),
      ]);
      if (sessRes.error) throw sessRes.error;
      if (chartRes.error) throw chartRes.error;
      setParentSessions((sessRes.data as SessionSummary[]) || []);
      setChartData(chartRes.data as ChartDataPayload | null);
      if (rankRes.error) {
        setGradeRank({ has_snapshot: false, error: rankRes.error.message });
      } else {
        setGradeRank(
          (rankRes.data as ParentGradeRankPayload | null) ?? { has_snapshot: false }
        );
      }
      setScreen("parent_dashboard");
      const stu = students.find((x) => x.id === studentId);
      if (stu?.parent_id) {
        void supabase.rpc("log_parent_dashboard_view", {
          p_parent_id: stu.parent_id,
          p_student_id: studentId,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入練習記錄。");
    } finally {
      setLoading(false);
    }
  };

  const handleParentMonthChange = (year: number, month: number) => {
    if (!selectedStudent) return;
    setParentMonth({ year, month });
    loadParentSessions(selectedStudent.id, parentSubject, year, month);
  };

  const handleViewSessionDetail = async (session: SessionSummary) => {
    setLoading(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc("get_session_detail", {
        p_session_id: session.id,
      });
      if (rpcErr) throw rpcErr;
      const result = data as { session: SessionSummary; answers: SessionDetailAnswer[] };
      setParentDetailSession(session);
      setParentDetailAnswers(result.answers || []);
      setScreen("parent_session_detail");
    } catch {
      setError("無法載入練習詳情。");
    } finally {
      setLoading(false);
    }
  };

  const handleSubjectSelect = useCallback(
    async (subject: string) => {
      if (!selectedStudent) return;
      setLoading(true);
      setError(null);
      try {
        const { data: bal } = await supabase.rpc("get_student_balance", {
          p_student_id: selectedStudent.id,
          p_subject: subject,
        });

        const balRecord = bal as StudentBalance | null;
        if (balRecord && balRecord.remaining_questions <= 0) {
          throw new Error("你的練習題目已用完，請聯絡家長充值。");
        }

        setBalance(balRecord);
        setSelectedSubject(subject);
        setScreen("question_count_select");
      } catch (err) {
        setError(err instanceof Error ? err.message : "無法開始測驗。");
      } finally {
        setLoading(false);
      }
    },
    [selectedStudent]
  );

  const handleQuestionCountSelect = async (count: number) => {
    if (!selectedStudent || !selectedSubject) return;
    if (balance && balance.remaining_questions < count) {
      setError(`餘額不足，你只剩 ${balance.remaining_questions} 題，請選擇較少的題數。`);
      return;
    }
    setError(null);
    await startQuiz(selectedStudent, selectedSubject, count);
  };

  const startQuiz = async (student: Student, subject: string, count: number = 10) => {
    setLoading(true);
    setCurrentIndex(0);
    setTextAnswer("");
    setAnswers([]);
    startTimeRef.current = Date.now();
    setShowSpeedReminder(false);
    speedReminderShownRef.current = false;
    answerTimestampsRef.current = [];

    try {
      const allQuestions = await fetchAllQuestions(subject, student.grade_level);
      if (allQuestions.length === 0)
        throw new Error("題庫中沒有找到適合的題目。");

      const { data: weights } = await supabase
        .from("parent_weights")
        .select("*")
        .eq("student_id", student.id)
        .ilikeAnyOf("subject", quizSubjectDbPatterns(subject));

      const selected = selectQuestions(
        allQuestions,
        (weights as ParentWeight[]) || [],
        count
      );

      const { data: session, error: sessErr } = await supabase.rpc(
        "create_quiz_session",
        { p_student_id: student.id, p_subject: subject }
      );
      if (sessErr) throw sessErr;

    setQuestions(selected);
    setSessionId((session as { id: string }).id);
    setEncourageIndex(Math.floor(Math.random() * 3));
    setQuizTransition(0);
    setSessionPracticeSummary(null);
    setScreen("quiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入測驗。");
    } finally {
      setLoading(false);
    }
  };

  const runSubmitWithAnswer = async (answer: string) => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion || !sessionId || submitting) return;

    const isCorrect = isShortAnswer(currentQuestion)
      ? answer.toLowerCase() === currentQuestion.correct_answer.toLowerCase()
      : answer === currentQuestion.correct_answer;

    answerTimestampsRef.current.push(Date.now());
    if (!speedReminderShownRef.current && answerTimestampsRef.current.length >= 3) {
      const ts = answerTimestampsRef.current;
      const last3Duration = ts[ts.length - 1] - ts[ts.length - 3];
      if (last3Duration < 5000) {
        setShowSpeedReminder(true);
        speedReminderShownRef.current = true;
      }
    }

    setSubmitting(true);
    try {
      const { error: ansErr } = await supabase.rpc("submit_answer", {
        p_session_id: sessionId,
        p_question_id: currentQuestion.id,
        p_student_answer: answer,
        p_is_correct: isCorrect,
        p_question_order: currentIndex + 1,
      });
      if (ansErr) throw ansErr;

      const newAnswer: AnswerRecord = {
        question: currentQuestion,
        studentAnswer: answer,
        isCorrect,
      };
      const updatedAnswers = [...answers, newAnswer];
      setAnswers(updatedAnswers);

      const newScore = updatedAnswers.filter((a) => a.isCorrect).length;
      const timeSpent = Math.round(
        (Date.now() - startTimeRef.current) / 1000
      );

      await supabase.rpc("update_quiz_session", {
        p_session_id: sessionId,
        p_questions_attempted: updatedAnswers.length,
        p_score: newScore,
        p_time_spent_seconds: timeSpent,
      });

      const isLastQ = currentIndex + 1 >= questions.length;
      if (isLastQ) {
        const summary = await finalizeQuizAndSummary(updatedAnswers);
        setSessionPracticeSummary(summary);
        setScreen("results");
        return;
      }
      if (selectedStudent && selectedSubject) {
        const { data: balFresh } = await supabase.rpc("get_student_balance", {
          p_student_id: selectedStudent.id,
          p_subject: selectedSubject,
        });
        if (balFresh) setBalance(balFresh as StudentBalance);
      }
      setCurrentIndex((i) => i + 1);
      setTextAnswer("");
      setQuizTransition((k) => k + 1);
      setEncourageIndex((e) => e + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交答案失敗。");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAnswer = async () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion || !isShortAnswer(currentQuestion)) return;
    const answer = textAnswer.trim();
    if (!answer) return;
    await runSubmitWithAnswer(answer);
  };

  const handleSelectMcqOption = async (label: string) => {
    if (submitting) return;
    if (getQuizSoundEnabled()) playClickSound();
    await runSubmitWithAnswer(label);
  };

  const finalizeQuizAndSummary = async (finalAnswers: AnswerRecord[]): Promise<string> => {
    if (!selectedStudent || !selectedSubject) return "";
    const summary = buildSessionPracticeSummary(finalAnswers, selectedSubject);
    const summaryParent = buildSessionPracticeSummaryForParent(
      finalAnswers,
      selectedSubject,
      selectedStudent.student_name || ""
    );
    if (sessionId) {
      try {
        const { error: sumErr } = await supabase.rpc("save_session_practice_summaries", {
          p_session_id: sessionId,
          p_student_id: selectedStudent.id,
          p_student_summary: summary,
          p_parent_summary: summaryParent,
        });
        if (sumErr) console.error("save_session_practice_summaries", sumErr);
      } catch (e) {
        console.error(e);
      }
    }
    try {
      /* Balance is deducted per answered question in submit_answer (see supabase_question_balance_per_answer.sql). */
      if (selectedStudent && selectedSubject) {
        const { data: balFresh } = await supabase.rpc("get_student_balance", {
          p_student_id: selectedStudent.id,
          p_subject: selectedSubject,
        });
        if (balFresh) setBalance(balFresh as StudentBalance);
      }

      const rankGroups: Record<string, { attempted: number; correct: number }> =
        {};
      for (const a of finalAnswers) {
        const rank = a.question.paper_rank;
        if (!rankGroups[rank])
          rankGroups[rank] = { attempted: 0, correct: 0 };
        rankGroups[rank].attempted++;
        if (a.isCorrect) rankGroups[rank].correct++;
      }

      for (const [rank, stats] of Object.entries(rankGroups)) {
        await supabase.rpc("upsert_rank_performance", {
          p_student_id: selectedStudent.id,
          p_subject: selectedSubject,
          p_paper_rank: rank,
          p_attempted: stats.attempted,
          p_correct: stats.correct,
        });
      }

      fetch("/api/send-quiz-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: selectedStudent.id,
          session_id: sessionId,
          session_summary_parent: summaryParent,
        }),
      }).catch(() => {});
    } catch {
      // non-critical: don't block results
    }
    return summary;
  };

  const handleRestart = () => {
    setScreen("subject_select");
    setQuestions([]);
    setSessionId(null);
    setAnswers([]);
    setSessionPracticeSummary(null);
    setError(null);
  };

  const handleLogout = () => {
    setScreen("login_mobile");
    setMobileNumber("");
    setStudents([]);
    setSelectedStudent(null);
    setPinInput("");
    setSelectedSubject(null);
    setBalance(null);
    setQuestions([]);
    setSessionId(null);
    setAnswers([]);
    setSessionPracticeSummary(null);
    setParentTierStatus({
      tier: "free",
      is_paid: false,
      paid_until: null,
      tier_label: "免費用戶",
    });
    setError(null);
  };

  if (loading) return <LoadingScreen />;

  if (screen === "login_mobile") {
    return (
      <LoginMobileScreen
        mobileNumber={mobileNumber}
        setMobileNumber={setMobileNumber}
        pin={pinInput}
        setPin={setPinInput}
        onSubmit={handleMobileSubmit}
        onRegister={() => {
          setError(null);
          setScreen("register");
        }}
        onForgotPassword={() => { setError(null); setScreen("forgot_password"); }}
        error={error}
        setError={setError}
      />
    );
  }

  if (screen === "login_role") {
    return (
      <RoleSelectScreen
        onStudent={() => setScreen("login_student")}
        onParent={() => {
          const firstStudent = students[0];
          if (firstStudent?.parent_id && firstStudent?.id) {
            void supabase.rpc("log_parent_dashboard_view", {
              p_parent_id: firstStudent.parent_id,
              p_student_id: firstStudent.id,
            });
          }
          if (students.length > 1) {
            setScreen("parent_student_select");
          } else if (firstStudent) {
            setSelectedStudent(firstStudent);
            loadParentSessions(firstStudent.id, parentSubject, parentMonth.year, parentMonth.month);
          }
        }}
        onAccount={() => setScreen("account_menu")}
        tierStatus={parentTierStatus}
        onUpgrade={() => setScreen("payment")}
        onBack={handleLogout}
      />
    );
  }

  if (screen === "account_menu") {
    return (
      <AccountMenuScreen
        onProfile={() => setScreen("profile_edit")}
        onAddStudent={() => setScreen("add_student_form")}
        onBalance={() => setScreen("balance_view")}
        onUpgrade={() => setScreen("payment")}
        tierStatus={parentTierStatus}
        onBack={() => setScreen("login_role")}
      />
    );
  }

  if (screen === "balance_view") {
    return (
      <BalanceViewScreen
        mobileNumber={mobileNumber}
        onBack={() => setScreen("account_menu")}
      />
    );
  }

  if (screen === "profile_edit") {
    return (
      <ProfileEditScreen
        mobileNumber={mobileNumber}
        onSaved={() => setScreen("account_menu")}
        onBack={() => setScreen("account_menu")}
      />
    );
  }

  if (screen === "add_student_form") {
    return (
      <AddStudentScreen
        mobileNumber={mobileNumber}
        onSubmit={handleAddStudentSubmit}
        onBack={() => setScreen("account_menu")}
        error={error}
        setError={setError}
      />
    );
  }

  if (screen === "parent_student_select") {
    return (
      <StudentSelectScreen
        students={students}
        onSelect={(student) => {
          setSelectedStudent(student);
          if (student.parent_id && student.id) {
            void supabase.rpc("log_parent_dashboard_view", {
              p_parent_id: student.parent_id,
              p_student_id: student.id,
            });
          }
          loadParentSessions(student.id, parentSubject, parentMonth.year, parentMonth.month);
        }}
        onBack={() => setScreen("login_role")}
        title="選擇學生"
        subtitle="請選擇要查看報告的學生"
      />
    );
  }

  if (screen === "forgot_password") {
    return (
      <ForgotPasswordScreen
        mobileNumber={mobileNumber}
        onBack={() => setScreen("login_role")}
      />
    );
  }

  if (screen === "parent_dashboard") {
    return (
      <ParentDashboard
        studentName={selectedStudent?.student_name || ""}
        gradeRank={gradeRank}
        sessions={parentSessions}
        year={parentMonth.year}
        month={parentMonth.month}
        subject={parentSubject}
        chartData={chartData}
        onMonthChange={handleParentMonthChange}
        onSubjectChange={(s) => {
          setParentSubject(s);
          if (selectedStudent) loadParentSessions(selectedStudent.id, s, parentMonth.year, parentMonth.month);
        }}
        onViewDetail={handleViewSessionDetail}
        tierStatus={parentTierStatus}
        onUpgrade={() => setScreen("payment")}
        onBack={() => setScreen("login_role")}
        onLogout={handleLogout}
      />
    );
  }

  if (screen === "payment") {
    return (
      <PaymentScreen
        mobileNumber={mobileNumber}
        tierStatus={parentTierStatus}
        onBack={() => setScreen("login_role")}
        onPaid={async () => {
          await refreshParentTierStatus();
          if (selectedStudent) {
            await loadParentSessions(
              selectedStudent.id,
              parentSubject,
              parentMonth.year,
              parentMonth.month
            );
          } else {
            setScreen("login_role");
          }
        }}
      />
    );
  }

  if (screen === "parent_session_detail") {
    return (
      <ParentSessionDetail
        session={parentDetailSession!}
        answers={parentDetailAnswers}
        studentName={selectedStudent?.student_name || ""}
        onBack={() => setScreen("parent_dashboard")}
        onLogout={handleLogout}
      />
    );
  }

  if (screen === "register") {
    return (
      <RegisterScreen
        mobileNumber={mobileNumber}
        setMobileNumber={setMobileNumber}
        onSubmit={handleRegister}
        onBack={() => {
          setError(null);
          setScreen("login_mobile");
        }}
        error={error}
        setError={setError}
      />
    );
  }

  if (screen === "login_student") {
    return (
      <StudentSelectScreen
        students={students}
        onSelect={handleStudentSelect}
        onBack={() => setScreen("login_role")}
      />
    );
  }

  if (screen === "subject_select") {
    return (
      <SubjectSelectScreen
        studentName={selectedStudent?.student_name || ""}
        onSelect={handleSubjectSelect}
        onLogout={handleLogout}
        error={error}
      />
    );
  }

  if (screen === "question_count_select") {
    return (
      <QuestionCountScreen
        studentName={selectedStudent?.student_name || ""}
        subjectKey={selectedSubject || ""}
        balance={balance?.remaining_questions ?? null}
        onSelect={handleQuestionCountSelect}
        onBack={() => { setError(null); setScreen("subject_select"); }}
        error={error}
      />
    );
  }

  if (screen === "results") {
    return (
      <ResultsView
        answers={answers}
        studentName={selectedStudent?.student_name || ""}
        studentId={selectedStudent?.id || null}
        sessionId={sessionId}
        sessionSummary={sessionPracticeSummary}
        onRestart={handleRestart}
        onLogout={handleLogout}
        balance={balance}
      />
    );
  }

  if (error) {
    return <ErrorScreen error={error} onRetry={handleRestart} />;
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    return <ErrorScreen error="沒有可用的題目。" onRetry={handleRestart} />;
  }

  const shortAnswer = isShortAnswer(currentQuestion);
  const canSubmit =
    shortAnswer && textAnswer.trim().length > 0 && !submitting;

  return (
    <div
      className="student-quiz-root min-h-dvh flex flex-col bg-amber-50/30"
      onContextMenu={preventContextMenu}
      onCopy={preventQuizClipboard}
      onCut={preventQuizClipboard}
      onDragStart={preventQuizDragStart}
    >
      <Header
        studentName={selectedStudent?.student_name}
        onLogout={handleLogout}
      />
      <div className="min-h-0 flex flex-1 flex-col">
        <StudentQuizExperience
          currentQuestion={currentQuestion}
          currentIndex={currentIndex}
          totalQuestions={questions.length}
          shortAnswer={shortAnswer}
          hasImage={hasImage}
          getImageUrl={getImagePublicUrl}
          textAnswer={textAnswer}
          onTextChange={(v) => setTextAnswer(v)}
          submitting={submitting}
          onSubmit={handleSubmitAnswer}
          canSubmit={canSubmit}
          isLastQuestion={currentIndex + 1 === questions.length}
          onToggleSound={() => {
            const n = !quizSoundOn;
            setQuizSoundOn(n);
            setQuizSoundEnabled(n);
          }}
          soundEnabled={quizSoundOn}
          encouragementIndex={encourageIndex}
          transitionKey={quizTransition}
          onSelectOption={handleSelectMcqOption}
          showSubmitButton={shortAnswer}
        />
      </div>
      {showSpeedReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="relative bg-white rounded-3xl shadow-2xl border-2 border-indigo-100 px-8 py-10 mx-4 max-w-xs text-center">
            <button
              onClick={() => setShowSpeedReminder(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
            >
              ✕
            </button>
            <p className="text-xl font-bold text-gray-800 leading-relaxed">
              看清題目，細心回答 💗
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function Header({
  studentName,
  onLogout,
}: {
  studentName?: string;
  onLogout: () => void;
}) {
  return (
    <div className="bg-white/80 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700">
        {studentName ? `${studentName}` : "GearUp Quiz"}
      </span>
      <button
        onClick={onLogout}
        className="text-sm text-gray-500 hover:text-red-500 transition-colors"
      >
        登出
      </button>
    </div>
  );
}

function LoginMobileScreen({
  mobileNumber,
  setMobileNumber,
  pin,
  setPin,
  onSubmit,
  onRegister,
  onForgotPassword,
  error,
  setError,
}: {
  mobileNumber: string;
  setMobileNumber: (v: string) => void;
  pin: string;
  setPin: (v: string) => void;
  onSubmit: () => void;
  onRegister: () => void;
  onForgotPassword: () => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const PIN_RE = /^[A-Za-z0-9]{6}$/;
  const pinValid = PIN_RE.test(pin.trim());
  const canLogin = mobileNumber.trim().length > 0 && pinValid;
  return (
    <div
      className="relative min-h-[100dvh] bg-white/60 backdrop-blur-sm"
      onContextMenu={preventContextMenu}
    >
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 pt-6 pb-24 sm:pb-28">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-images/Banana%20images/GearUplogo.png`}
              alt="GearUp Quiz"
              className="mx-auto w-full max-w-xs sm:max-w-sm h-auto mb-4"
              draggable={false}
            />
            <p className="mt-3 text-[15px] leading-relaxed text-indigo-700 font-['Comic_Sans_MS','Chalkboard_SE','Trebuchet_MS','PingFang_TC','Microsoft_JhengHei',sans-serif]">
              GearUp 增分寶：香港小學生必備！免費中英數複習平台，幫小朋友輕鬆增分，學習無壓力！
            </p>
            <p className="mt-2 text-[15px] text-gray-600 font-['Comic_Sans_MS','Chalkboard_SE','Trebuchet_MS','PingFang_TC','Microsoft_JhengHei',sans-serif]">
              請輸入電話號碼及密碼登入
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                電話號碼
              </label>
              <input
                type="tel"
                autoComplete="username"
                value={mobileNumber}
                onChange={(e) => {
                  setMobileNumber(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && canLogin && onSubmit()}
                placeholder="例如：91234567"
                className="w-full p-4 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                密碼
              </label>
              <input
                type="password"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6));
                  if (error) setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && canLogin && onSubmit()}
                placeholder="6 位英文或數字密碼"
                className="w-full p-4 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400 transition-colors"
              />
              {pin.length > 0 && !pinValid && (
                <p className="mt-1 text-xs text-red-500">請輸入6位英文字母或數字</p>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-500 font-medium">{error}</p>
            )}
            <button
              onClick={onSubmit}
              disabled={!canLogin}
              className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${
                canLogin
                  ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              登入
            </button>
            <div className="text-center pt-2 border-t border-gray-100 space-y-2">
              <p className="text-sm text-gray-500">
                還沒有帳戶？{" "}
                <button
                  onClick={onRegister}
                  className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors"
                >
                  新用戶註冊
                </button>
              </p>
              <button
                onClick={onForgotPassword}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                忘記密碼？
              </button>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-center text-sm text-indigo-700">
            有問題或意見？歡迎電郵至{" "}
            <a href="mailto:cs@hkedutech.com" className="font-semibold underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900">
              cs@hkedutech.com
            </a>
          </div>
          <div
            className="mt-6 rounded-3xl border border-amber-100 bg-gradient-to-b from-amber-50 via-white to-sky-50 p-6 shadow-lg shadow-amber-100/40 space-y-6"
            style={{ fontFamily: "var(--font-baloo2), var(--font-noto-sans-tc), system-ui, sans-serif" }}
          >
            <section className="space-y-3">
              <div className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                平台簡介
              </div>
              <p className="text-sm leading-7 text-gray-700">
                增分寶 GearUp Quiz 是一個涵蓋中、英、數三科，並結合 AI
                個人化學習與香港本地課程掛鉤的平台。
              </p>
              <ul className="space-y-3 text-sm leading-7 text-gray-700">
                <li className="rounded-2xl border border-amber-100 bg-white/80 px-3 py-2">
                  <span className="font-semibold text-gray-900">全方位混合學習模式：</span>
                  不同於市面上單一功能的平台，本平台提供每日互動練習以鞏固基礎，讓學生在應付日常功課與備考週測、大考時都能得心應手。
                </li>
                <li className="rounded-2xl border border-sky-100 bg-white/80 px-3 py-2">
                  <span className="font-semibold text-gray-900">AI 智能精準補漏，提升學習效率：</span>
                  利用 AI
                  演算法追蹤學生的薄弱環節，並提供即時自動批改與詳細解說，幫助孩子從錯誤中學習，確保每分鐘的練習都能發揮最大效用。
                </li>
                <li className="rounded-2xl border border-violet-100 bg-white/80 px-3 py-2">
                  <span className="font-semibold text-gray-900">100% 貼合香港教育局課程：</span>
                  內容完全根據香港教育局（EDB）課程指引編寫，涵蓋中、英、數三科核心學科，確保學習內容與學校進度同步，直接有效提升校內成績。
                </li>
              </ul>
            </section>

            <hr className="border-amber-200" />

            <section className="space-y-4">
              <div className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-900">
                常見問題（FAQ）
              </div>

              <div className="space-y-1 rounded-2xl border border-sky-100 bg-white/85 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">1. 平台涵蓋哪些年級和科目？</h3>
                <p className="text-sm leading-7 text-gray-700">
                  平台專為香港小學 P1 至 P6 學生設計。核心科目包括中文、英文及數學，全方位照顧小學階段的學術需求。
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-violet-100 bg-white/85 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">2. 相比其他平台，你們的優勢在哪裡？</h3>
                <p className="text-sm leading-7 text-gray-700">
                  目前的競爭對手主要集中於線上練習，家長未能掌握學生學習強弱，以致與同級其他同學的成績差異。
                </p>
                <p className="text-sm leading-7 text-gray-700">我們的優勢在於：</p>
                <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-700">
                  <li>既有 AI 驅動的每日練習，且在中文、英文及數學三科捆綁訂閱上的價格更具競爭力。</li>
                  <li>平台有詳細的家長報告，讓您充分掌握學生與其他同級學生的練習成績差異，讓您知己知彼。</li>
                  <li>每月免費 200 題不同科目練習。</li>
                </ol>
              </div>

              <div className="space-y-1 rounded-2xl border border-amber-100 bg-white/85 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">3. 家長如何了解孩子的學習進度？</h3>
                <p className="text-sm leading-7 text-gray-700">
                  平台設有專為家長設計的進度報告與數據儀表板。您可以即時查看孩子的正確率、完成進度以及 AI
                  分析出的強項與弱項，隨時隨地掌握學習情況。
                </p>
              </div>

              <div className="space-y-1 rounded-2xl border border-emerald-100 bg-white/85 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">4. 平台的收費模式是怎樣的？</h3>
                <p className="text-sm leading-7 text-gray-700">
                  我們提供超靈活的月費計劃，無需長期綁約，讓您可以根據孩子的學習進度隨時開始或暫停，給予家長最輕鬆、無壓力的學習彈性。每月
                  $99 港幣即可享用中、英、數三科全開的專業版無限題練習。月費會員更可將學生成績與全港或按各區學生成績作比較，得知與其他學生的練習成績差異。
                </p>
              </div>

              <div className="space-y-1 rounded-2xl border border-rose-100 bg-white/85 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">5. 練習內容是否設有自動批改功能？</h3>
                <p className="text-sm leading-7 text-gray-700">
                  是的。平台提供即時自動批改系統，學生提交答案後會立即獲得回饋與解釋。這不僅能減輕家長對稿的時間負擔，也能讓學生在記憶最清晰時糾正錯誤概念。
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
      <footer
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 border-t border-gray-200/70 bg-white/55 py-3 text-center backdrop-blur-sm sm:py-3.5"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <p className="pointer-events-auto text-[11px] text-gray-500/90 sm:text-xs">
          © 2026 GearUp EduTech Limited
        </p>
      </footer>
    </div>
  );
}

interface SchoolOption {
  id: string;
  area: string;
  district: string;
  name_zh: string | null;
  name_en: string;
}

function RegisterScreen({
  mobileNumber,
  setMobileNumber,
  onSubmit,
  onBack,
  error,
  setError,
}: {
  mobileNumber: string;
  setMobileNumber: (v: string) => void;
  onSubmit: (form: {
    studentName: string;
    pinCode: string;
    avatarStyle: string;
    gradeLevel: string;
    email: string;
    schoolId: string | null;
  }) => void;
  onBack: () => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const [studentName, setStudentName] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [avatarStyle, setAvatarStyle] = useState<string>("");
  const [gradeLevel, setGradeLevel] = useState<string>("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileBypass, setTurnstileBypass] = useState(false);
  const [turnstileErrorCode, setTurnstileErrorCode] = useState<string | null>(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [privacyStatementText, setPrivacyStatementText] = useState<string | null>(null);
  const [privacyLoadError, setPrivacyLoadError] = useState<string | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_schools").then(({ data }) => {
      if (data) setSchools(data as SchoolOption[]);
      setSchoolsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!privacyModalOpen) return;
    const url = getPrivacyStatementTxtUrl();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPrivacyLoadError(null);
      if (!url) {
        setPrivacyLoading(false);
        setPrivacyLoadError(
          "無法取得私隱政策網址：請設定 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_PRIVACY_STATEMENT_URL。"
        );
        return;
      }
      setPrivacyLoading(true);
      if (privacyStatementText === null) {
        fetch(url, { cache: "no-store" })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.text();
          })
          .then((text) => {
            if (!cancelled) setPrivacyStatementText(text);
          })
          .catch(() => {
            if (!cancelled) {
              setPrivacyLoadError("無法載入私隱政策全文，請稍後再試或直接開啟官方連結。");
            }
          })
          .finally(() => {
            if (!cancelled) setPrivacyLoading(false);
          });
      } else {
        setPrivacyLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [privacyModalOpen, privacyStatementText]);

  const areas = [...new Set(schools.map((s) => s.area))];
  const districts = [...new Set(schools.filter((s) => s.area === selectedArea).map((s) => s.district))];
  const filteredSchools = schools.filter((s) => s.area === selectedArea && s.district === selectedDistrict);

  const PIN_RE = /^[A-Za-z0-9]{6}$/;
  const pinValid = PIN_RE.test(pinCode);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const mobileValid = /^\d{8}$/.test(mobileNumber.trim()) && !mobileNumber.trim().startsWith("999");
  const privacyStatementUrl = getPrivacyStatementTxtUrl();
  const canSubmit =
    mobileValid &&
    studentName.trim().length > 0 &&
    pinValid &&
    avatarStyle !== "" &&
    gradeLevel !== "" &&
    selectedSchoolId !== null &&
    email.trim().length > 0 &&
    privacyAgreed &&
    privacyStatementUrl.length > 0 &&
    (siteKey && !turnstileBypass ? turnstileToken !== null : true);

  const grades = ["P1", "P2", "P3", "P4", "P5", "P6"];
  const avatars: { value: string; label: string; gradient: string }[] = [
    { value: "Boy", label: "男生", gradient: "from-blue-400 to-indigo-500" },
    { value: "Girl", label: "女生", gradient: "from-pink-400 to-rose-500" },
  ];

  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4 py-8"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">新用戶註冊</h1>
          <p className="mt-1 text-sm text-gray-500">
            請填寫以下資料完成註冊
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              家長電話號碼（香港手提電話號碼）
            </label>
            <input
              type="tel"
              value={mobileNumber}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                setMobileNumber(v);
                if (error) setError(null);
              }}
              maxLength={8}
              placeholder="例如：91234567"
              className={`w-full p-3.5 rounded-xl border-2 text-base outline-none transition-colors ${
                (mobileNumber.length > 0 && mobileNumber.length !== 8) || (mobileNumber.length === 8 && mobileNumber.startsWith("999"))
                  ? "border-red-300 focus:border-red-400"
                  : "border-gray-200 focus:border-indigo-400"
              }`}
            />
            {mobileNumber.length > 0 && mobileNumber.length !== 8 && (
              <p className="mt-1 text-xs text-red-500">請輸入8位數字電話號碼</p>
            )}
            {mobileNumber.length === 8 && mobileNumber.startsWith("999") && (
              <p className="mt-1 text-xs text-red-500">輸入的電話號碼無效</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              學生姓名
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => {
                setStudentName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="輸入學生姓名"
              className="w-full p-3.5 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              6 位英文或數字組合密碼（用於學生及家長登入）
            </label>
            <input
              type="text"
              value={pinCode}
              onChange={(e) => {
                const v = e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6);
                setPinCode(v);
                if (error) setError(null);
              }}
              maxLength={6}
              placeholder="例如：abc123"
              className={`w-full p-3.5 rounded-xl border-2 text-base outline-none transition-colors ${
                pinCode.length > 0 && !pinValid
                  ? "border-red-300 focus:border-red-400"
                  : "border-gray-200 focus:border-indigo-400"
              }`}
            />
            {pinCode.length > 0 && !pinValid && (
              <p className="mt-1 text-xs text-red-500">
                請輸入6位英文字母或數字
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              姓別
            </label>
            <div className="flex gap-3">
              {avatars.map((a) => (
                <button
                  key={a.value}
                  onClick={() => {
                    setAvatarStyle(a.value);
                    if (error) setError(null);
                  }}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    avatarStyle === a.value
                      ? `border-indigo-500 bg-gradient-to-br ${a.gradient} text-white shadow-md`
                      : "border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-gray-50"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              年級
            </label>
            <div className="grid grid-cols-3 gap-2">
              {grades.map((g) => (
                <button
                  key={g}
                  onClick={() => {
                    setGradeLevel(g);
                    if (error) setError(null);
                  }}
                  className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all duration-200 ${
                    gradeLevel === g
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                      : "border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-gray-50"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              學校
            </label>
            {!schoolsLoaded ? (
              <p className="text-sm text-gray-400">載入學校列表中...</p>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedArea}
                  onChange={(e) => {
                    setSelectedArea(e.target.value);
                    setSelectedDistrict("");
                    setSelectedSchoolId(null);
                  }}
                  className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400 transition-colors bg-white"
                >
                  <option value="">選擇區域</option>
                  {areas.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                {selectedArea && (
                  <select
                    value={selectedDistrict}
                    onChange={(e) => {
                      setSelectedDistrict(e.target.value);
                      setSelectedSchoolId(null);
                    }}
                    className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400 transition-colors bg-white"
                  >
                    <option value="">選擇地區</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}
                {selectedDistrict && (
                  <select
                    value={selectedSchoolId || ""}
                    onChange={(e) => setSelectedSchoolId(e.target.value || null)}
                    className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400 transition-colors bg-white"
                  >
                    <option value="">選擇學校</option>
                    {filteredSchools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name_zh || s.name_en}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              家長電郵（用於接收練習通知）
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="例如：parent@example.com"
              className="w-full p-3.5 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400 transition-colors"
            />
          </div>

          {siteKey && (
            <div className="flex justify-center">
              <Turnstile
                siteKey={siteKey}
                onSuccess={(token) => {
                  setTurnstileToken(token);
                  setTurnstileBypass(false);
                  setTurnstileErrorCode(null);
                }}
                onError={(code) => {
                  setTurnstileToken(null);
                  setTurnstileBypass(true);
                  setTurnstileErrorCode(normalizeTurnstileErrorCode(code));
                }}
                onExpire={() => {
                  setTurnstileToken(null);
                  if (!turnstileBypass) {
                    setTurnstileErrorCode(null);
                  }
                }}
                options={{ theme: "light", size: "normal" }}
              />
            </div>
          )}
          {turnstileBypass && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
              驗證服務暫時不可用，系統已切換為備援模式可繼續註冊
              {turnstileErrorCode ? `（錯誤碼：${turnstileErrorCode}）` : ""}。
            </p>
          )}

          {error && (
            <p className="text-sm text-red-500 font-medium">{error}</p>
          )}

          <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
            <label className="flex gap-3 cursor-pointer items-start">
              <input
                type="checkbox"
                checked={privacyAgreed}
                onChange={(e) => {
                  setPrivacyAgreed(e.target.checked);
                  if (error) setError(null);
                }}
                className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700 leading-snug">
                本人確認已閱讀並同意本平台的
                <button
                  type="button"
                  onClick={() => setPrivacyModalOpen(true)}
                  className="text-indigo-600 font-semibold underline underline-offset-2 hover:text-indigo-800"
                >
                  私隱政策聲明
                </button>
              </span>
            </label>
          </div>

          <button
            onClick={async () => {
              const { data: emailCheck } = await supabase.rpc("check_email_exists", { p_email: email.trim() });
              if (emailCheck && (emailCheck as { exists: boolean }).exists) {
                setError("輸入的電郵已經登記");
                return;
              }
              onSubmit({ studentName: studentName.trim(), pinCode, avatarStyle, gradeLevel, email: email.trim(), schoolId: selectedSchoolId });
            }}
            disabled={!canSubmit}
            className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${
              canSubmit
                ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            同意並繼續
          </button>

          <button
            onClick={onBack}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
          >
            返回登入
          </button>
        </div>
      </div>

      {privacyModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="presentation"
          onClick={() => setPrivacyModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-modal-title"
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 shrink-0">
              <h2 id="privacy-modal-title" className="text-lg font-bold text-gray-900">
                私隱政策聲明
              </h2>
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="關閉"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {privacyLoading && privacyStatementText === null && (
                <p className="text-gray-500">載入中…</p>
              )}
              {privacyLoadError && (
                <p className="text-red-600 mb-3">{privacyLoadError}</p>
              )}
              {privacyStatementText !== null && privacyStatementText}
              {(privacyLoadError || privacyStatementText === null) && !privacyLoading && privacyStatementUrl && (
                <p className="mt-4 text-xs text-gray-500 break-all">
                  官方檔案連結：
                  <a
                    href={privacyStatementUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 underline"
                  >
                    {privacyStatementUrl}
                  </a>
                </p>
              )}
            </div>
            <div className="border-t border-gray-100 px-4 py-3 shrink-0">
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-800 font-semibold text-sm hover:bg-gray-200"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentSelectScreen({
  students,
  onSelect,
  onBack,
  title,
  subtitle,
}: {
  students: Student[];
  onSelect: (s: Student) => void;
  onBack: () => void;
  title?: string;
  subtitle?: string;
}) {
  const avatarColors = [
    "from-indigo-400 to-purple-500",
    "from-emerald-400 to-teal-500",
    "from-amber-400 to-orange-500",
    "from-pink-400 to-rose-500",
    "from-cyan-400 to-blue-500",
  ];
  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{title || "選擇學生"}</h1>
          <p className="mt-2 text-gray-500">{subtitle || "請選擇你的名字"}</p>
        </div>
        <div className="space-y-3">
          {students.map((s, i) => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-5 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
            >
              <div
                className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-lg font-bold`}
              >
                {s.student_name.charAt(0)}
              </div>
              <div className="text-left">
                <p className="text-base font-semibold text-gray-900">
                  {s.student_name}
                </p>
                <p className="text-sm text-gray-500">{s.grade_level}</p>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={onBack}
          className="mt-6 w-full text-center text-sm text-gray-500 hover:text-gray-700"
        >
          返回
        </button>
      </div>
    </div>
  );
}

function SubjectSelectScreen({
  studentName,
  onSelect,
  onLogout,
  error,
}: {
  studentName: string;
  onSelect: (s: string) => void;
  onLogout: () => void;
  error: string | null;
}) {
  const subjects = [...STUDENT_SUBJECT_OPTIONS];
  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {studentName}，準備好了嗎？
          </h1>
          <p className="mt-2 text-gray-500">請選擇科目開始練習</p>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 text-center">
            {error}
          </div>
        )}
        <div className="space-y-3">
          {subjects.map((s) => (
            <button
              key={s.key}
              onClick={() => onSelect(s.key)}
              className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
            >
              <span className="text-3xl">{s.icon}</span>
              <span className="text-lg font-semibold text-gray-900">
                {s.label}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={onLogout}
          className="mt-6 w-full text-center text-sm text-gray-500 hover:text-gray-700"
        >
          登出
        </button>
      </div>
    </div>
  );
}

function QuestionCountScreen({
  studentName,
  subjectKey,
  balance,
  onSelect,
  onBack,
  error,
}: {
  studentName: string;
  subjectKey: string;
  balance: number | null;
  onSelect: (count: number) => void;
  onBack: () => void;
  error: string | null;
}) {
  const subjectLine = subjectKey ? subjectDisplayLabel(subjectKey) : "";
  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {studentName}，選擇題數
          </h1>
          <p className="mt-2 text-gray-500">
            {subjectLine} — 請選擇本次練習的題目數量
          </p>
          {balance !== null && (
            <p className="mt-1 text-sm text-indigo-600 font-medium">
              目前餘額：{balance} 題
            </p>
          )}
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 text-center">
            {error}
          </div>
        )}
        <div className="space-y-3">
          {QUESTION_COUNT_OPTIONS.map((count) => {
            const disabled = balance !== null && balance < count;
            return (
              <button
                key={count}
                onClick={() => !disabled && onSelect(count)}
                disabled={disabled}
                className={`w-full bg-white rounded-2xl shadow-md border border-gray-100 p-5 flex items-center justify-between transition-all duration-200 ${
                  disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:border-indigo-300 hover:shadow-lg active:scale-[0.98]"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                    disabled
                      ? "bg-gray-100 text-gray-400"
                      : "bg-gradient-to-br from-indigo-400 to-purple-500 text-white"
                  }`}>
                    {count}
                  </div>
                  <span className={`text-base font-semibold ${disabled ? "text-gray-400" : "text-gray-900"}`}>
                    {count} 題
                  </span>
                </div>
                {disabled && (
                  <span className="text-xs text-red-400">餘額不足</span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={onBack}
          className="mt-6 w-full text-center text-sm text-gray-500 hover:text-gray-700"
        >
          返回
        </button>
      </div>
    </div>
  );
}

function getPracticeResultBannerSrc(): string {
  const override = process.env.NEXT_PUBLIC_PRACTICE_RESULT_BANNER_URL?.trim();
  if (override) return override;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  if (base) {
    return `${base}/storage/v1/object/public/Webpage_images/logo/GearUp_Chi_Eng_banner.png`;
  }
  return "/storage/v1/object/public/Webpage_images/logo/GearUp_Chi_Eng_banner.png";
}

function ResultsView({
  answers,
  studentName,
  studentId,
  sessionId,
  sessionSummary,
  onRestart,
  onLogout,
  balance,
}: {
  answers: AnswerRecord[];
  studentName: string;
  studentId: string | null;
  sessionId: string | null;
  sessionSummary: string | null;
  onRestart: () => void;
  onLogout: () => void;
  balance: StudentBalance | null;
}) {
  const score = answers.filter((a) => a.isCorrect).length;
  const total = answers.length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const summaryText =
    sessionSummary?.trim() || buildSessionPracticeSummary(answers, answers[0]?.question.subject || "");

  const wrongAnswers = answers
    .map((answer, index) => ({ answer, index }))
    .filter(({ answer }) => !answer.isCorrect);

  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [reportingId, setReportingId] = useState<string | null>(null);

  const handleReport = async (answer: AnswerRecord) => {
    if (reportedIds.has(answer.question.id) || reportingId) return;
    setReportingId(answer.question.id);
    try {
      const { error } = await supabase.rpc("report_question", {
        p_question_id: answer.question.id,
        p_student_id: studentId,
        p_session_id: sessionId,
        p_student_answer: answer.studentAnswer,
      });
      if (error) throw error;
      setReportedIds((prev) => new Set(prev).add(answer.question.id));
    } catch {
      // silent fail — non-critical
    } finally {
      setReportingId(null);
    }
  };

  let scoreColor = "text-red-600";
  let scoreBg = "bg-red-50 border-red-200";
  if (percentage >= 80) {
    scoreColor = "text-emerald-600";
    scoreBg = "bg-emerald-50 border-emerald-200";
  } else if (percentage >= 60) {
    scoreColor = "text-amber-600";
    scoreBg = "bg-amber-50 border-amber-200";
  }

  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm"
      onContextMenu={preventContextMenu}
    >
      <Header studentName={studentName} onLogout={onLogout} />
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className={`text-center p-6 sm:p-8 rounded-2xl border-2 ${scoreBg} mb-8`}>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            測驗完成！
          </h1>
          <p className={`mt-3 text-4xl sm:text-5xl font-extrabold ${scoreColor}`}>
            {score} / {total}
          </p>
          <p className="mt-2 text-lg text-gray-600">{percentage}% 正確</p>
          {balance && (
            <p className="mt-2 text-sm text-gray-500">
              剩餘題目：{balance.remaining_questions}
            </p>
          )}
        </div>

        <div className="mb-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          <div className="shrink-0 self-center sm:self-end">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getPracticeResultBannerSrc()}
              alt="GearUp 增分寶 Banner"
              className="h-auto w-44 max-w-[70vw] sm:w-56"
              width={560}
              height={140}
              draggable={false}
            />
          </div>
          <div className="relative min-w-0 flex-1 rounded-3xl border-4 border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-4 text-sm leading-relaxed text-slate-800 shadow-md sm:text-base">
            <p className="text-xs font-bold text-amber-800/90 sm:text-sm">小香蕉的練習小結</p>
            <p className="mt-2 text-pretty" style={{ fontFamily: "var(--font-baloo2), system-ui" }}>
              {summaryText}
            </p>
            <div
              className="absolute -bottom-2 left-6 h-4 w-4 rotate-45 border-b-2 border-r-2 border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50"
              aria-hidden
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-12">
                  #
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                  你的答案
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                  結果
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {answers.map((answer, i) => {
                const shortAns = isShortAnswer(answer.question);
                return (
                  <tr
                    key={i}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                  >
                    <td className="px-3 py-3 text-center text-sm font-medium text-gray-500">
                      {i + 1}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {shortAns ? (
                        <span className="inline-block px-2 py-0.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 max-w-[120px] truncate">
                          {answer.studentAnswer}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                          {answer.studentAnswer}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {answer.isCorrect ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                          ✓ 正確
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                          ✗ 錯誤
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {wrongAnswers.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3">
              錯題解析
            </h2>
            <div className="space-y-4">
              {wrongAnswers.map(({ answer, index }) => (
                <div
                  key={index}
                  className="bg-white rounded-2xl shadow-md border border-red-100 overflow-hidden"
                >
                  <div className="bg-red-50 px-4 py-3 border-b border-red-100">
                    <p className="text-sm font-semibold text-gray-800">
                      <span className="text-red-500 mr-1">第 {index + 1} 題</span>
                      <span className="text-gray-400 mx-1">|</span>
                      <span className="text-xs text-gray-500">
                        你的答案：{answer.studentAnswer}
                      </span>
                      <span className="text-gray-400 mx-1">|</span>
                      <span className="text-xs text-emerald-600">
                        正確答案：{answer.question.correct_answer}
                      </span>
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <QuestionContentParagraphs
                      content={answer.question.content}
                      className="text-sm text-gray-700"
                      paragraphGapClass="mt-3"
                    />
                    {hasImage(answer.question) && (
                      <QuestionImage
                        src={getImagePublicUrl(answer.question)!}
                      />
                    )}
                    {answer.question.explanation ? (
                      <QuestionContentParagraphs
                        content={answer.question.explanation}
                        className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3"
                        paragraphGapClass="mt-2"
                      />
                    ) : (
                      <p className="text-sm text-gray-400 italic">沒有解釋</p>
                    )}
                    <div className="pt-1">
                      <button
                        onClick={() => handleReport(answer)}
                        disabled={reportedIds.has(answer.question.id) || reportingId === answer.question.id}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 ${
                          reportedIds.has(answer.question.id)
                            ? "bg-gray-100 text-gray-400 cursor-default"
                            : reportingId === answer.question.id
                              ? "bg-amber-50 text-amber-400 cursor-wait"
                              : "bg-amber-50 text-amber-600 hover:bg-amber-100 active:scale-[0.97]"
                        }`}
                      >
                        {reportedIds.has(answer.question.id)
                          ? "已反映"
                          : reportingId === answer.question.id
                            ? "提交中..."
                            : "反映這題目"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onRestart}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg active:scale-[0.98]"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            再做一次
          </button>
          <button
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-gray-700 font-semibold rounded-xl border border-gray-300 hover:bg-gray-50 transition-all duration-200"
          >
            登出
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionImage({ src }: { src: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading"
  );
  return (
    <div className="mt-4">
      {status === "loading" && (
        <div className="flex items-center justify-center py-4">
          <Spinner />
          <span className="ml-2 text-indigo-200 text-sm">載入圖片中...</span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Question image"
        draggable={false}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={`max-w-full rounded-lg border-2 border-white/20 shadow-md ${
          status === "loaded" ? "" : "hidden"
        }`}
      />
      {status === "error" && (
        <p className="text-indigo-200 text-sm italic py-2">
          圖片無法載入。
        </p>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center"
      onContextMenu={preventContextMenu}
    >
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 mb-4">
          <Spinner size="lg" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800">載入中...</h2>
        <p className="mt-2 text-gray-500">正在準備你的題目</p>
      </div>
    </div>
  );
}

function ErrorScreen({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-800">出錯了</h2>
        <p className="mt-2 text-gray-500">{error}</p>
        <button
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all duration-200"
        >
          重試
        </button>
      </div>
    </div>
  );
}

function AddStudentScreen({
  mobileNumber,
  onSubmit,
  onBack,
  error,
  setError,
}: {
  mobileNumber: string;
  onSubmit: (form: { studentName: string; avatarStyle: string; gradeLevel: string; schoolId: string | null }) => void;
  onBack: () => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const [studentName, setStudentName] = useState("");
  const [avatarStyle, setAvatarStyle] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileBypass, setTurnstileBypass] = useState(false);
  const [turnstileErrorCode, setTurnstileErrorCode] = useState<string | null>(null);

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_schools").then(({ data }) => {
      if (data) setSchools(data as SchoolOption[]);
      setSchoolsLoaded(true);
    });
  }, []);

  const areas = [...new Set(schools.map((s) => s.area))];
  const districts = [...new Set(schools.filter((s) => s.area === selectedArea).map((s) => s.district))];
  const filteredSchools = schools.filter((s) => s.area === selectedArea && s.district === selectedDistrict);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const canSubmit =
    studentName.trim().length > 0 &&
    avatarStyle !== "" &&
    gradeLevel !== "" &&
    selectedSchoolId !== null &&
    (siteKey && !turnstileBypass ? turnstileToken !== null : true);

  const grades = ["P1", "P2", "P3", "P4", "P5", "P6"];
  const avatars: { value: string; label: string; gradient: string }[] = [
    { value: "Boy", label: "男生", gradient: "from-blue-400 to-indigo-500" },
    { value: "Girl", label: "女生", gradient: "from-pink-400 to-rose-500" },
  ];

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4 py-8" onContextMenu={preventContextMenu}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">新增學生</h1>
          <p className="mt-1 text-sm text-gray-400">電話號碼：{mobileNumber}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">學生姓名</label>
            <input value={studentName} onChange={(e) => { setStudentName(e.target.value); if (error) setError(null); }}
              placeholder="輸入學生姓名"
              className="w-full p-3.5 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">姓別</label>
            <div className="flex gap-3">
              {avatars.map((a) => (
                <button key={a.value} onClick={() => { setAvatarStyle(a.value); if (error) setError(null); }}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    avatarStyle === a.value ? `border-indigo-500 bg-gradient-to-br ${a.gradient} text-white shadow-md` : "border-gray-200 text-gray-600 hover:border-indigo-300"
                  }`}>{a.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">年級</label>
            <div className="grid grid-cols-3 gap-2">
              {grades.map((g) => (
                <button key={g} onClick={() => { setGradeLevel(g); if (error) setError(null); }}
                  className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    gradeLevel === g ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm" : "border-gray-200 text-gray-600 hover:border-indigo-300"
                  }`}>{g}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">學校</label>
            {!schoolsLoaded ? <p className="text-sm text-gray-400">載入學校列表中...</p> : (
              <div className="space-y-2">
                <select value={selectedArea} onChange={(e) => { setSelectedArea(e.target.value); setSelectedDistrict(""); setSelectedSchoolId(null); }}
                  className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400 bg-white">
                  <option value="">選擇區域</option>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                {selectedArea && (
                  <select value={selectedDistrict} onChange={(e) => { setSelectedDistrict(e.target.value); setSelectedSchoolId(null); }}
                    className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400 bg-white">
                    <option value="">選擇地區</option>
                    {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}
                {selectedDistrict && (
                  <select value={selectedSchoolId || ""} onChange={(e) => setSelectedSchoolId(e.target.value || null)}
                    className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400 bg-white">
                    <option value="">選擇學校</option>
                    {filteredSchools.map((s) => <option key={s.id} value={s.id}>{s.name_zh || s.name_en}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          {siteKey && (
            <div className="flex justify-center">
              <Turnstile
                siteKey={siteKey}
                onSuccess={(token) => {
                  setTurnstileToken(token);
                  setTurnstileBypass(false);
                  setTurnstileErrorCode(null);
                }}
                onError={(code) => {
                  setTurnstileToken(null);
                  setTurnstileBypass(true);
                  setTurnstileErrorCode(normalizeTurnstileErrorCode(code));
                }}
                onExpire={() => {
                  setTurnstileToken(null);
                  if (!turnstileBypass) {
                    setTurnstileErrorCode(null);
                  }
                }}
                options={{ theme: "light", size: "normal" }}
              />
            </div>
          )}
          {turnstileBypass && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
              驗證服務暫時不可用，系統已切換為備援模式可繼續操作
              {turnstileErrorCode ? `（錯誤碼：${turnstileErrorCode}）` : ""}。
            </p>
          )}

          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
            提示：新增的學生將會共用現有的題目餘額。
          </p>

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

          <button onClick={() => onSubmit({ studentName: studentName.trim(), avatarStyle, gradeLevel, schoolId: selectedSchoolId })}
            disabled={!canSubmit}
            className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${canSubmit ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
            新增學生
          </button>
          <button onClick={onBack} className="w-full text-center text-sm text-gray-500 hover:text-gray-700">返回</button>
        </div>
      </div>
    </div>
  );
}

function AccountMenuScreen({
  onProfile,
  onAddStudent,
  onBalance,
  onUpgrade,
  tierStatus,
  onBack,
}: {
  onProfile: () => void;
  onAddStudent: () => void;
  onBalance: () => void;
  onUpgrade: () => void;
  tierStatus: ParentTierStatus;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4" onContextMenu={preventContextMenu}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">戶口管理</h1>
          <p className="mt-2 text-gray-500">請選擇操作</p>
        </div>
        <div className="space-y-3">
          <div className={`rounded-xl border px-4 py-3 ${tierStatus.is_paid ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
            <p className={`text-sm font-semibold ${tierStatus.is_paid ? "text-emerald-700" : "text-gray-700"}`}>
              會員狀態：{tierStatus.is_paid ? "月費用戶" : "免費用戶"}
            </p>
            {tierStatus.is_paid && tierStatus.paid_until && (
              <p className="mt-1 text-xs text-emerald-700/80">
                有效至：{new Date(tierStatus.paid_until).toLocaleDateString("zh-HK")}
              </p>
            )}
          </div>
          <button onClick={onBalance}
            className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center text-white text-xl">📊</div>
            <div className="text-left">
              <p className="text-base font-semibold text-gray-900">題目餘額</p>
              <p className="text-sm text-gray-500">查看餘額及消費記錄</p>
            </div>
          </button>
          <button onClick={onProfile}
            className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xl">⚙️</div>
            <div className="text-left">
              <p className="text-base font-semibold text-gray-900">更新資料</p>
              <p className="text-sm text-gray-500">修改個人及學生資料</p>
            </div>
          </button>
          <button onClick={onAddStudent}
            className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-xl">👦</div>
            <div className="text-left">
              <p className="text-base font-semibold text-gray-900">新增學生</p>
              <p className="text-sm text-gray-500">在此帳戶下新增學生</p>
            </div>
          </button>
          {!tierStatus.is_paid && (
            <button onClick={onUpgrade}
              className="w-full bg-indigo-50 rounded-2xl shadow-sm border border-indigo-200 p-4 text-left hover:bg-indigo-100 transition-all duration-200">
              <p className="text-sm font-semibold text-indigo-700">成為月費會員(每月$99)</p>
              <p className="text-xs text-indigo-600 mt-1">即可以獲得學生排名資訊。</p>
            </button>
          )}
        </div>
        <button onClick={onBack} className="mt-6 w-full text-center text-sm text-gray-500 hover:text-gray-700">返回</button>
      </div>
    </div>
  );
}

function ProfileEditScreen({
  mobileNumber,
  onSaved,
  onBack,
}: {
  mobileNumber: string;
  onSaved: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [parentId, setParentId] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [sharedPin, setSharedPin] = useState("");
  const [studentEdits, setStudentEdits] = useState<{
    id: string;
    student_name: string;
    avatar_style: string;
    grade_level: string;
    school_id: string | null;
    gender: string | null;
  }[]>([]);

  const [schools, setSchools] = useState<{ id: string; area: string; district: string; name_zh: string | null; name_en: string }[]>([]);
  const [schoolAreas, setSchoolAreas] = useState<Record<string, string>>({});
  const [schoolDistricts, setSchoolDistricts] = useState<Record<string, string>>({});
  const pinFormatValid = /^[A-Za-z0-9]{6}$/.test(sharedPin);

  useEffect(() => {
    (async () => {
      const [profileRes, schoolsRes] = await Promise.all([
        supabase.rpc("get_parent_profile", { p_mobile: mobileNumber.trim() }),
        supabase.rpc("get_schools"),
      ]);

      if (schoolsRes.data) {
        const s = schoolsRes.data as typeof schools;
        setSchools(s);
        const areaMap: Record<string, string> = {};
        const distMap: Record<string, string> = {};
        s.forEach((sc) => { areaMap[sc.id] = sc.area; distMap[sc.id] = sc.district; });
        setSchoolAreas(areaMap);
        setSchoolDistricts(distMap);
      }

      if (profileRes.data) {
        const d = profileRes.data as {
          parent: { id: string; mobile_number: string; parent_name: string | null; email: string | null };
          students: {
            id: string;
            student_name: string;
            avatar_style: string;
            grade_level: string;
            school_id: string | null;
            gender?: string | null;
          }[];
        };
        setParentId(d.parent.id);
        setParentName(d.parent.parent_name || "");
        setParentEmail(d.parent.email || "");
        setStudentEdits(
          d.students.map((s) => {
            const g = s.gender?.trim() ? s.gender.trim().toUpperCase() : "";
            const fromGender =
              g === "M" ? "Boy" : g === "F" ? "Girl" : s.avatar_style || "Boy";
            return {
              ...s,
              gender: s.gender ?? null,
              avatar_style: fromGender,
            };
          })
        );
      }
      setLoading(false);
    })();
  }, [mobileNumber]);

  const updateStudent = (idx: number, field: string, value: string | null) => {
    setStudentEdits((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    if (!pinFormatValid) {
      setMsg("密碼需為 6 位英文字母或數字");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      await supabase.rpc("update_parent_profile", {
        p_parent_id: parentId,
        p_parent_name: parentName || null,
        p_email: parentEmail || null,
      });

      for (const s of studentEdits) {
        await supabase.rpc("update_student_profile", {
          p_student_id: s.id,
          p_student_name: s.student_name,
          p_pin_code: sharedPin,
          p_avatar_style: s.avatar_style,
          p_grade_level: s.grade_level,
          p_school_id: s.school_id,
          p_gender: s.avatar_style === "Boy" ? "M" : s.avatar_style === "Girl" ? "F" : null,
        });
      }

      setMsg("資料已更新");
      setTimeout(() => {
        onSaved();
      }, 1000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "儲存失敗，請重試");
    } finally {
      setSaving(false);
    }
  };

  const grades = ["P1", "P2", "P3", "P4", "P5", "P6"];
  const avatars = [
    { value: "Boy", label: "男生" },
    { value: "Girl", label: "女生" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-2 text-gray-500">載入資料中...</p>
        </div>
      </div>
    );
  }

  const getSchoolSelector = (idx: number) => {
    const s = studentEdits[idx];
    const currentSchool = schools.find((sc) => sc.id === s.school_id);
    const selectedArea = currentSchool ? schoolAreas[currentSchool.id] || "" : (s as unknown as Record<string, string>).__area || "";
    const selectedDistrict = currentSchool ? schoolDistricts[currentSchool.id] || "" : (s as unknown as Record<string, string>).__district || "";

    const areas = [...new Set(schools.map((sc) => sc.area))];
    const districts = [...new Set(schools.filter((sc) => sc.area === selectedArea).map((sc) => sc.district))];
    const filtered = schools.filter((sc) => sc.area === selectedArea && sc.district === selectedDistrict);

    return (
      <div className="space-y-2">
        <select
          value={selectedArea}
          onChange={(e) => {
            updateStudent(idx, "school_id", null);
            updateStudent(idx, "__area" as string, e.target.value);
            updateStudent(idx, "__district" as string, "");
          }}
          className="w-full p-2 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-indigo-400"
        >
          <option value="">選擇區域</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {selectedArea && (
          <select
            value={selectedDistrict}
            onChange={(e) => {
              updateStudent(idx, "school_id", null);
              updateStudent(idx, "__district" as string, e.target.value);
            }}
            className="w-full p-2 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-indigo-400"
          >
            <option value="">選擇地區</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {selectedDistrict && (
          <select
            value={s.school_id || ""}
            onChange={(e) => updateStudent(idx, "school_id", e.target.value || null)}
            className="w-full p-2 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-indigo-400"
          >
            <option value="">選擇學校</option>
            {filtered.map((sc) => (
              <option key={sc.id} value={sc.id}>{sc.name_zh || sc.name_en}</option>
            ))}
          </select>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm" onContextMenu={preventContextMenu}>
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">更新資料</span>
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-indigo-600">返回</button>
      </div>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <p className="text-sm text-gray-400">電話號碼：{mobileNumber}</p>

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-800">家長資料</h2>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">家長姓名</label>
            <input value={parentName} onChange={(e) => setParentName(e.target.value)}
              placeholder="輸入家長姓名"
              className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">電郵地址</label>
            <input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)}
              placeholder="輸入電郵地址"
              className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-800">密碼</h2>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">登入密碼（6 位英文或數字，所有學生共用）</label>
            <input value={sharedPin} onChange={(e) => setSharedPin(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6))}
              maxLength={6}
              className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400" />
            <p className="mt-2 text-xs text-gray-500">
              儲存後會以加密方式更新，不會在前端或資料庫中保存可讀明文。
            </p>
          </div>
        </div>

        {studentEdits.map((s, idx) => (
          <div key={s.id} className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 space-y-4">
            <h2 className="text-base font-bold text-gray-800">學生資料 {studentEdits.length > 1 ? `(${idx + 1})` : ""}</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">學生姓名</label>
              <input value={s.student_name} onChange={(e) => updateStudent(idx, "student_name", e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">姓別</label>
              <div className="flex gap-2">
                {avatars.map((a) => (
                  <button key={a.value} onClick={() => updateStudent(idx, "avatar_style", a.value)}
                    className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                      s.avatar_style === a.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-600 hover:border-indigo-300"
                    }`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">年級</label>
              <div className="grid grid-cols-3 gap-2">
                {grades.map((g) => (
                  <button key={g} onClick={() => updateStudent(idx, "grade_level", g)}
                    className={`py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                      s.grade_level === g
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-600 hover:border-indigo-300"
                    }`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">學校</label>
              {getSchoolSelector(idx)}
            </div>
          </div>
        ))}

        {msg && <p className={`text-sm text-center ${msg.includes("已更新") ? "text-emerald-600" : "text-red-500"}`}>{msg}</p>}

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">
            {saving ? "儲存中..." : "儲存"}
          </button>
          <button onClick={onBack}
            className="flex-1 py-3.5 rounded-xl bg-white text-gray-700 font-semibold border border-gray-300 hover:bg-gray-50 transition-all">
            返回
          </button>
        </div>
      </div>
    </div>
  );
}

function ForgotPasswordScreen({ mobileNumber, onBack }: { mobileNumber: string; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/send-reset-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), mobile: mobileNumber.trim() }),
      });
      const data = await res.json();
      if (data.found === false) {
        setMsg("此電郵地址與你的帳戶記錄不符，請重新輸入。");
      } else if (data.sent) {
        setSent(true);
      } else {
        setMsg(data.detail ? `發送失敗：${data.detail}` : "發送失敗，請重試。");
      }
    } catch {
      setMsg("發送失敗，請重試。");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4" onContextMenu={preventContextMenu}>
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">電郵已發送</h1>
          <p className="text-sm text-gray-500 mb-6">
            密碼重設連結已發送到 <strong>{email}</strong>，請檢查你的電郵（包括垃圾郵件資料夾）。連結將於 1 小時後失效。
          </p>
          <button onClick={onBack}
            className="px-8 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-md">
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4" onContextMenu={preventContextMenu}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">忘記密碼</h1>
          <p className="mt-2 text-gray-500">請輸入你註冊時使用的電郵地址</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setMsg(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="輸入電郵地址"
            className="w-full p-4 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400 transition-colors"
          />
          {msg && <p className="text-sm text-red-500">{msg}</p>}
          <button
            onClick={handleSubmit}
            disabled={!email.trim() || loading}
            className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${
              email.trim() && !loading ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md" : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {loading ? "發送中..." : "發送重設連結"}
          </button>
          <button onClick={onBack} className="w-full text-center text-sm text-gray-500 hover:text-gray-700">返回</button>
        </div>
      </div>
    </div>
  );
}

function pctColor(pct: number): string {
  if (pct >= 80) return "#059669";
  if (pct >= 60) return "#d97706";
  return "#dc2626";
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { datetime: string; pct: number } }> }) {
  if (!active || !payload || !payload[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 text-xs">
      <p className="text-gray-500">{d.datetime}</p>
      <p className="font-bold" style={{ color: pctColor(d.pct) }}>{d.pct}%</p>
    </div>
  );
}

function OverallChart({ chartData }: { chartData: ChartDataPayload }) {
  const overallAvg = chartData.grade_averages.find((g) => g.question_type === "_overall");
  const data = [...chartData.sessions].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((s, i) => {
    const d = new Date(s.created_at);
    return {
      idx: i,
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      datetime: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      pct: s.correct_pct,
      fill: pctColor(s.correct_pct),
    };
  });

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 mb-4">
      <h3 className="text-sm font-bold text-gray-800 mb-3">整體正確率趨勢（最近30次）</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="idx" tick={{ fontSize: 10 }} interval="preserveStartEnd"
            tickFormatter={(idx: number) => data[idx]?.date || ""} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip content={<ChartTooltip />} />
          {overallAvg && (
            <ReferenceLine y={Number(overallAvg.avg_correct_pct)} stroke="#f59e0b" strokeDasharray="5 5"
              label={{ value: `同級平均 ${overallAvg.avg_correct_pct}%`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }} />
          )}
          <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-2">如同一天多於一次練習，則會有多個棒型以同一日標示。</p>
    </div>
  );
}

function TypeCharts({ chartData }: { chartData: ChartDataPayload }) {
  const typeCounts = new Map<string, number>();
  chartData.type_sessions.forEach((t) => typeCounts.set(t.question_type, (typeCounts.get(t.question_type) || 0) + 1));
  const types = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  const avgMap = new Map(chartData.grade_averages.map((g) => [g.question_type, Number(g.avg_correct_pct)]));

  return (
    <div className="mt-3 space-y-4">
      {types.map((type) => {
        const sessions = chartData.type_sessions
          .filter((t) => t.question_type === type)
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        const data = sessions.map((s, i) => {
          const d = new Date(s.created_at);
          return {
            idx: i,
            date: `${d.getMonth() + 1}/${d.getDate()}`,
            datetime: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
            pct: s.correct_pct,
            fill: pctColor(s.correct_pct),
          };
        });
        const avg = avgMap.get(type);

        return (
          <div key={type} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h4 className="text-xs font-bold text-gray-700 mb-2">{type}</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="idx" tick={{ fontSize: 9 }} interval="preserveStartEnd"
                  tickFormatter={(i: number) => data[i]?.date || ""} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTooltip />} />
                {avg !== undefined && (
                  <ReferenceLine y={avg} stroke="#f59e0b" strokeDasharray="5 5"
                    label={{ value: `平均${avg}%`, position: "insideTopRight", fontSize: 9, fill: "#f59e0b" }} />
                )}
                <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

function BalanceViewScreen({ mobileNumber, onBack }: { mobileNumber: string; onBack: () => void }) {
  const [balanceSubject, setBalanceSubject] = useState(PRIMARY_QUIZ_SUBJECT);
  const [data, setData] = useState<ParentBalanceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data: res } = await supabase.rpc("get_parent_balance_view", {
        p_mobile: mobileNumber.trim(),
        p_subject: balanceSubject,
        p_year: viewMonth.year,
        p_month: viewMonth.month,
      });
      if (!cancelled) {
        setData(res as ParentBalanceView | null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mobileNumber, viewMonth, fetchKey, balanceSubject]);

  const prevMonth = () => {
    setLoading(true);
    setViewMonth((prev) => ({
      year: prev.month === 1 ? prev.year - 1 : prev.year,
      month: prev.month === 1 ? 12 : prev.month - 1,
    }));
    setFetchKey((k) => k + 1);
  };
  const nextMonth = () => {
    const now = new Date();
    const currentYM = now.getFullYear() * 12 + now.getMonth() + 1;
    const nextYM = viewMonth.year * 12 + viewMonth.month + 1;
    if (nextYM > currentYM) return;
    setLoading(true);
    setViewMonth((prev) => ({
      year: prev.month === 12 ? prev.year + 1 : prev.year,
      month: prev.month === 12 ? 1 : prev.month + 1,
    }));
    setFetchKey((k) => k + 1);
  };

  const monthLabel = `${viewMonth.year} 年 ${viewMonth.month} 月`;
  const groupedTransactions = useMemo<GroupedBalanceTransaction[]>(() => {
    if (!data?.transactions?.length) return [];
    const grouped = new Map<string, GroupedBalanceTransaction>();

    for (const tx of data.transactions) {
      const createdAt = new Date(tx.created_at);
      const dateKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;
      const studentName = tx.student_name || "—";
      const key = `${dateKey}|${studentName}`;
      const existing = grouped.get(key);

      const currentBalanceAfter =
        typeof tx.balance_after === "number" ? tx.balance_after : 0;
      if (!existing) {
        grouped.set(key, {
          id: key,
          date: dateKey,
          student_name: studentName,
          description: "當日合計扣除",
          change_amount: tx.change_amount,
          balance_after: currentBalanceAfter,
        });
      } else {
        existing.change_amount += tx.change_amount;
        // Keep the end-of-day family balance (smallest number for deductions).
        if (
          existing.balance_after == null ||
          currentBalanceAfter < existing.balance_after
        ) {
          existing.balance_after = currentBalanceAfter;
        }
      }
    }

    return [...grouped.values()].sort((a, b) => a.date < b.date ? 1 : -1);
  }, [data]);
  const isUnlimited = Boolean(data && data.total_balance < 0);
  const totalBalanceLabel = isUnlimited ? "Unlimited" : String(data?.total_balance ?? 0);
  const openingBalanceLabel = isUnlimited ? "Unlimited" : String(data?.opening_balance ?? 0);

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm" onContextMenu={preventContextMenu}>
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">題目餘額</span>
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-indigo-600">返回</button>
      </div>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {STUDENT_SUBJECT_OPTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                if (s.key === balanceSubject) return;
                setBalanceSubject(s.key);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                balanceSubject === s.key
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {data && (
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-md p-5">
            <p className="text-indigo-100 text-xs font-medium">題目餘額（{subjectDisplayLabel(balanceSubject)}）</p>
            <p className="text-white text-4xl font-extrabold mt-1">{totalBalanceLabel}</p>
            <p className="text-indigo-200 text-xs mt-2">此餘額由所有學生共用</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-white transition-colors text-gray-600 hover:text-indigo-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-base font-semibold text-gray-800">{monthLabel}</span>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-white transition-colors text-gray-600 hover:text-indigo-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8"><Spinner size="lg" /></div>
        ) : data && groupedTransactions.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">日期</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">學生</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">描述</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">變動</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">餘額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="bg-gray-50/50">
                  <td className="px-3 py-2 text-xs text-gray-400">{viewMonth.month}/1</td>
                  <td className="px-3 py-2 text-xs text-gray-400">—</td>
                  <td className="px-3 py-2 text-xs text-gray-400">月初餘額</td>
                  <td className="px-3 py-2 text-xs text-gray-400 text-right">—</td>
                  <td className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">{openingBalanceLabel}</td>
                </tr>
                {groupedTransactions.map((tx) => {
                  const [yy, mm, dd] = tx.date.split("-");
                  const dateStr = `${Number(mm)}/${Number(dd)}`;
                  const isPositive = tx.change_amount > 0;
                  return (
                    <tr key={tx.id}>
                      <td className="px-3 py-2 text-xs text-gray-500">{dateStr}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{tx.student_name}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{tx.description}</td>
                      <td className={`px-3 py-2 text-xs font-semibold text-right ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                        {isPositive ? "+" : ""}{tx.change_amount}
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-gray-700 text-right">
                        {tx.balance_after === null ? "—" : tx.balance_after}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">本月暫無交易記錄</p>
          </div>
        )}

        <ContactFooter />
      </div>
    </div>
  );
}

function ContactFooter() {
  return (
    <div className="mt-8 py-4 border-t border-gray-200 text-center">
      <p className="text-xs text-gray-400">
        有問題或意見？請聯絡{" "}
        <a href="mailto:cs@hkedutech.com" className="text-indigo-500 hover:text-indigo-600">
          cs@hkedutech.com
        </a>
      </p>
    </div>
  );
}

function RoleSelectScreen({
  onStudent,
  onParent,
  onAccount,
  onUpgrade,
  tierStatus,
  onBack,
}: {
  onStudent: () => void;
  onParent: () => void;
  onAccount: () => void;
  onUpgrade: () => void;
  tierStatus: ParentTierStatus;
  onBack: () => void;
}) {
  const whatsappHref = `https://wa.me/85252861715?text=${encodeURIComponent("客戶服務查詢")}`;

  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">選擇身份</h1>
          <p className="mt-2 text-gray-500">請選擇登入身份</p>
          <div className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            tierStatus.is_paid ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
          }`}>
            {tierStatus.is_paid ? "月費用戶" : "免費用戶"}
          </div>
        </div>
        {!tierStatus.is_paid && (
          <button
            onClick={onUpgrade}
            className="mb-3 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            成為月費會員(每月$99)，即可以獲得學生排名資訊。
          </button>
        )}
        <div className="space-y-3">
          <button
            onClick={onStudent}
            className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xl">
              📝
            </div>
            <div className="text-left">
              <p className="text-base font-semibold text-gray-900">學生</p>
              <p className="text-sm text-gray-500">開始練習</p>
            </div>
          </button>
          <button
            onClick={onParent}
            className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xl">
              📊
            </div>
            <div className="text-left">
              <p className="text-base font-semibold text-gray-900">家長</p>
              <p className="text-sm text-gray-500">查看練習報告</p>
            </div>
          </button>
          <button
            onClick={onAccount}
            className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xl">
              ⚙️
            </div>
            <div className="text-left">
              <p className="text-base font-semibold text-gray-900">戶口管理</p>
              <p className="text-sm text-gray-500">題目餘額及管理戶口資料</p>
            </div>
          </button>
          {tierStatus.is_paid && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-full bg-[#25D366] flex items-center justify-center text-white">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fill="currentColor"
                    d="M20.52 3.48A11.82 11.82 0 0 0 12.12 0C5.54 0 .18 5.36.18 11.94c0 2.1.55 4.15 1.6 5.97L0 24l6.28-1.65a11.9 11.9 0 0 0 5.84 1.5h.01c6.58 0 11.94-5.36 11.94-11.94 0-3.2-1.25-6.2-3.55-8.43ZM12.13 21.8h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.22-3.72.98 1-3.62-.24-.37a9.82 9.82 0 0 1-1.5-5.25c0-5.44 4.42-9.86 9.87-9.86 2.64 0 5.12 1.03 6.98 2.9a9.8 9.8 0 0 1 2.9 6.97c0 5.44-4.43 9.85-9.88 9.85Zm5.4-7.35c-.3-.15-1.8-.89-2.08-.99-.28-.1-.49-.15-.69.15-.2.3-.79.99-.96 1.2-.18.2-.36.23-.67.08-.3-.15-1.29-.47-2.46-1.5-.91-.8-1.52-1.8-1.7-2.1-.18-.3-.02-.46.13-.6.13-.13.3-.34.45-.5.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.69-1.67-.95-2.29-.25-.6-.5-.52-.69-.53h-.59c-.2 0-.53.08-.8.38-.28.3-1.06 1.03-1.06 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.13 4.54.72.31 1.28.5 1.72.64.72.23 1.37.2 1.89.12.58-.09 1.8-.74 2.05-1.45.26-.72.26-1.33.18-1.45-.07-.13-.28-.2-.58-.35Z"
                  />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-base font-semibold text-gray-900">客戶服務</p>
                <p className="text-sm text-gray-500">WhatsApp 即時查詢</p>
              </div>
            </a>
          )}
        </div>
        {!tierStatus.is_paid && (
          <p className="mt-4 text-center text-sm text-gray-500">
            有問題或意見? 歡迎電郵至{" "}
            <a
              href="mailto:cs@hkedutech.com"
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              cs@hkedutech.com
            </a>
          </p>
        )}
        <button
          onClick={onBack}
          className="mt-6 w-full text-center text-sm text-gray-500 hover:text-gray-700"
        >
          返回
        </button>
      </div>
    </div>
  );
}

function ParentGradeRankPanel({
  studentName,
  rank,
  subjectUiLabel,
}: {
  studentName: string;
  rank: ParentGradeRankPayload | null;
  /** Current dashboard subject tab (rank + charts match this subject) */
  subjectUiLabel: string;
}) {
  const notReady = (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-gray-200 bg-gradient-to-b from-rose-100/80 via-amber-100/80 to-emerald-100/80 h-14" aria-hidden>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
        <p className="text-center text-xs text-gray-600 px-3 leading-relaxed">
          學生完成100題練習後，系統將會提供評級數據。
        </p>
      </div>
    </div>
  );

  if (!rank || !rank.has_snapshot) {
    return (
      <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-3">
        <p className="text-[11px] text-gray-500 mb-2 leading-snug">
          「同級排名」按<strong>{subjectUiLabel}</strong>科目計算（與下方練習列表、趨勢圖同一科目）。
        </p>
        <p className="text-sm text-amber-800/90">暫無同級排名資料（系統每日更新）。</p>
        <p className="mt-1 text-[11px] text-gray-400 leading-snug">
          僅計算<strong>{subjectUiLabel}</strong>科目已累積完成至少 100 題的學生；排名以該科目「最近 10 次練習」的平均正確率比較，每日凌晨批次更新。
        </p>
      </div>
    );
  }

  const displayName = (rank.student_name || studentName).trim() || "學生";
  const eligible = rank.is_eligible === true;
  const total = rank.total_eligible_in_grade ?? 0;
  const rnk = rank.rank_in_grade;
  const avg = rank.last_10_avg_correct_pct;
  const calcAt = rank.calculated_at
    ? new Date(rank.calculated_at)
    : null;
  const updatedStr = calcAt
    ? `${calcAt.getFullYear()}/${calcAt.getMonth() + 1}/${calcAt.getDate()} ${String(calcAt.getHours()).padStart(2, "0")}:${String(calcAt.getMinutes()).padStart(2, "0")}`
    : null;

  if (!eligible) {
    return (
      <div className="mb-4 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
        <p className="text-[11px] text-gray-500 mb-2 leading-snug">
          「同級排名」按<strong>{subjectUiLabel}</strong>科目計算（與下方練習列表、趨勢圖同一科目）。
        </p>
        <p className="text-sm text-gray-800">
          {displayName} 完成累積 100 題練習後，即可與同級同學比較表現。
        </p>
        {notReady}
        <p className="mt-2 text-[11px] text-gray-400 leading-snug">
          僅計算<strong>{subjectUiLabel}</strong>科目已累積完成至少 100 題的學生；排名以該科目「最近 10 次練習」的平均正確率比較，每日凌晨更新。{updatedStr ? ` 資料更新：${updatedStr}。` : ""}
        </p>
      </div>
    );
  }

  if (total === 0 || rnk == null) {
    return (
      <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-3">
        <p className="text-[11px] text-gray-500 mb-2 leading-snug">
          「同級排名」按<strong>{subjectUiLabel}</strong>科目計算（與下方練習列表、趨勢圖同一科目）。
        </p>
        <p className="text-sm text-amber-800/90">同級暫時沒有足夠學生可顯示排名。</p>
        {notReady}
        <p className="mt-2 text-[11px] text-gray-400 leading-snug">
          僅計算<strong>{subjectUiLabel}</strong>科目已累積完成至少 100 題的學生；排名以該科目「最近 10 次練習」的平均正確率比較，每日凌晨更新。
        </p>
      </div>
    );
  }

  const posPct =
    total <= 1
      ? 50
      : Math.min(100, Math.max(0, ((total - rnk) / (total - 1)) * 100));

  return (
    <div className="mb-4 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] text-gray-500 mb-2 leading-snug">
        「同級排名」按<strong>{subjectUiLabel}</strong>科目計算（與下方練習列表、趨勢圖同一科目）。
      </p>
      <p className="text-sm text-gray-800 font-medium">
        {displayName} 在同級活躍用戶中排第 {rnk} 名（共 {total} 人）
      </p>
      <p className="mt-1 text-xs text-gray-500">
        最近 10 次練習平均正確率
        {avg != null
          ? `：${(Math.round(Number(avg) * 10) / 10).toFixed(1)}%`
          : "：—"}
        {updatedStr ? ` · 資料更新：${updatedStr}` : ""}
      </p>
      <div className="mt-3 relative h-9 select-none" role="img" aria-label="同級表現位置（紅至綠）">
        <div className="absolute inset-0 flex rounded-lg overflow-hidden">
          <div className="flex-1 bg-gradient-to-b from-rose-400 to-rose-500" />
          <div className="flex-1 bg-gradient-to-b from-amber-300 to-amber-400" />
          <div className="flex-1 bg-gradient-to-b from-emerald-400 to-emerald-500" />
        </div>
        <div
          className="absolute -top-1 w-0 h-0 border-l-[7px] border-r-[7px] border-b-[9px] border-l-transparent border-r-transparent border-b-gray-800 -translate-x-1/2"
          style={{ left: `${posPct}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-gray-400 leading-snug">
        僅納入該科目累積完成至少 100 題的同級學生；以該科目「最近 10 次練習」各次正確率之平均排序，表現愈高排名愈前。箭頭表示相對位置（紅：待加強，綠：表現佳）。每日凌晨批次更新，非即時。
      </p>
    </div>
  );
}

function ParentDashboard({
  studentName,
  gradeRank,
  sessions,
  year,
  month,
  subject,
  chartData,
  onMonthChange,
  onSubjectChange,
  onViewDetail,
  tierStatus,
  onUpgrade,
  onBack,
  onLogout,
}: {
  studentName: string;
  gradeRank: ParentGradeRankPayload | null;
  sessions: SessionSummary[];
  year: number;
  month: number;
  subject: string;
  chartData: ChartDataPayload | null;
  onMonthChange: (y: number, m: number) => void;
  onSubjectChange: (s: string) => void;
  onViewDetail: (s: SessionSummary) => void;
  tierStatus: ParentTierStatus;
  onUpgrade: () => void;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chartsExpanded, setChartsExpanded] = useState(false);
  const subjects = STUDENT_SUBJECT_OPTIONS.map(({ key, label }) => ({ key, label }));
  const monthLabel = `${year} 年 ${month} 月`;

  const prevMonth = () => {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    onMonthChange(y, m);
    setSelectedId(null);
  };
  const nextMonth = () => {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    onMonthChange(y, m);
    setSelectedId(null);
  };

  const totalQuestions = sessions.reduce((s, x) => s + x.questions_attempted, 0);
  const totalCorrect = sessions.reduce((s, x) => s + x.score, 0);
  const avgPct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm" onContextMenu={preventContextMenu}>
      <div className="bg-white/80 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{studentName} 的練習報告</span>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-indigo-600 transition-colors">返回</button>
          <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-500 transition-colors">登出</button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2 mb-4">
          {subjects.map((s) => (
            <button
              key={s.key}
              onClick={() => { onSubjectChange(s.key); setSelectedId(null); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                subject === s.key
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {tierStatus.is_paid ? (
          <ParentGradeRankPanel
            studentName={studentName}
            rank={gradeRank}
            subjectUiLabel={subjectDisplayLabel(subject)}
          />
        ) : (
          <div className="mb-4 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-700">升級月費會員 ($99)，解鎖全港同級排名！助您精準掌握子女中英數實力水平。附設無限題庫，隨時按弱項強化，讓孩子在同儕中脫穎而出！</p>
            <img
              src={getRankSampleImageUrl()}
              alt="排名範例"
              className="mt-3 w-full rounded-xl border border-gray-200"
            />
            <button
              onClick={onUpgrade}
              className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              取得排名資訊
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-white transition-colors text-gray-600 hover:text-indigo-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-base font-semibold text-gray-800">{monthLabel}</span>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-white transition-colors text-gray-600 hover:text-indigo-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {sessions.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 mb-4 flex justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-indigo-600">{sessions.length}</p>
              <p className="text-xs text-gray-500">練習次數</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{avgPct}%</p>
              <p className="text-xs text-gray-500">平均正確率</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-700">{totalQuestions}</p>
              <p className="text-xs text-gray-500">總題數</p>
            </div>
          </div>
        )}

        {chartData && chartData.sessions.length > 0 && (
          <OverallChart chartData={chartData} />
        )}

        {sessions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-base">本月暫無練習記錄</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {sessions.map((s) => {
                const pct = s.questions_attempted > 0 ? Math.round((s.score / s.questions_attempted) * 100) : 0;
                const isSelected = selectedId === s.id;
                let borderColor = "border-gray-100";
                let scoreColor = "text-red-600";
                if (pct >= 80) { scoreColor = "text-emerald-600"; borderColor = isSelected ? "border-emerald-400" : "border-gray-100"; }
                else if (pct >= 60) { scoreColor = "text-amber-600"; borderColor = isSelected ? "border-amber-400" : "border-gray-100"; }
                else { borderColor = isSelected ? "border-red-400" : "border-gray-100"; }

                const d = new Date(s.created_at);
                const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(isSelected ? null : s.id)}
                    className={`bg-white rounded-xl shadow-sm border-2 p-3 text-center transition-all duration-200 hover:shadow-md ${
                      isSelected ? borderColor + " shadow-md" : "border-gray-100"
                    }`}
                  >
                    <p className="text-xs text-gray-400">{dateStr} {timeStr}</p>
                    <p className={`text-xl font-bold mt-1 ${scoreColor}`}>{s.score}/{s.questions_attempted}</p>
                    <p className="text-xs text-gray-500">{pct}%</p>
                  </button>
                );
              })}
            </div>

            {selectedId && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    const s = sessions.find((x) => x.id === selectedId);
                    if (s) onViewDetail(s);
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg active:scale-[0.98]"
                >
                  查看詳情
                </button>
              </div>
            )}
          </>
        )}

        {tierStatus.is_paid && chartData && chartData.type_sessions.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setChartsExpanded(!chartsExpanded)}
              className="w-full flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 hover:shadow-md transition-all"
            >
              <span className="text-sm font-semibold text-gray-700">各題型正確率趨勢</span>
              <svg className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${chartsExpanded ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {chartsExpanded && (
              <TypeCharts chartData={chartData} />
            )}
          </div>
        )}
        {!tierStatus.is_paid && (
          <div className="mt-6 rounded-2xl border border-indigo-100 bg-white p-4">
            <p className="text-sm text-gray-700">成為月費會員(每月$99)，即可獲得學生於各題型的正確率資訊。</p>
            <button
              onClick={onUpgrade}
              className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              取得資訊
            </button>
          </div>
        )}

        <ContactFooter />
      </div>
    </div>
  );
}

function ParentSessionDetail({
  session,
  answers,
  studentName,
  onBack,
  onLogout,
}: {
  session: SessionSummary;
  answers: SessionDetailAnswer[];
  studentName: string;
  onBack: () => void;
  onLogout: () => void;
}) {
  const score = answers.filter((a) => a.is_correct).length;
  const total = answers.length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const incorrect = total - score;

  const d = new Date(session.created_at);
  const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mins = Math.floor(session.time_spent_seconds / 60);
  const secs = session.time_spent_seconds % 60;
  const timeStr = mins > 0 ? `${mins} 分 ${secs} 秒` : `${secs} 秒`;

  let scoreColor = "text-red-600";
  let scoreBg = "bg-red-50 border-red-200";
  if (percentage >= 80) { scoreColor = "text-emerald-600"; scoreBg = "bg-emerald-50 border-emerald-200"; }
  else if (percentage >= 60) { scoreColor = "text-amber-600"; scoreBg = "bg-amber-50 border-amber-200"; }

  const wrongAnswers = answers
    .map((a, i) => ({ answer: a, index: i }))
    .filter(({ answer }) => !answer.is_correct);

  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm" onContextMenu={preventContextMenu}>
      <Header studentName={`${studentName} 的練習報告`} onLogout={onLogout} />
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          返回列表
        </button>

        <div className={`text-center p-5 rounded-2xl border-2 ${scoreBg} mb-6`}>
          <p className="text-sm text-gray-500">{dateStr} · {subjectDisplayLabel(session.subject)} · 用時 {timeStr}</p>
          <p className={`mt-2 text-4xl font-extrabold ${scoreColor}`}>{score} / {total}</p>
          <p className="mt-1 text-base text-gray-600">{percentage}% 正確 · 答對 {score} 題 · 答錯 {incorrect} 題</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mb-6">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-12">#</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">答案</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">結果</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {answers.map((a, i) => {
                const sa = a.question.opt_a == null && a.question.opt_b == null && a.question.opt_c == null && a.question.opt_d == null;
                return (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-3 py-3 text-center text-sm font-medium text-gray-500">{i + 1}</td>
                    <td className="px-3 py-3 text-center">
                      {sa ? (
                        <span className="inline-block px-2 py-0.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 max-w-[120px] truncate">{a.student_answer}</span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-700">{a.student_answer}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {a.is_correct ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">✓ 正確</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">✗ 錯誤</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {wrongAnswers.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-3">錯題解析</h2>
            <div className="space-y-4">
              {wrongAnswers.map(({ answer, index }) => (
                <div key={index} className="bg-white rounded-2xl shadow-md border border-red-100 overflow-hidden">
                  <div className="bg-red-50 px-4 py-3 border-b border-red-100">
                    <p className="text-sm font-semibold text-gray-800">
                      <span className="text-red-500 mr-1">第 {index + 1} 題</span>
                      <span className="text-gray-400 mx-1">|</span>
                      <span className="text-xs text-gray-500">答案：{answer.student_answer}</span>
                      <span className="text-gray-400 mx-1">|</span>
                      <span className="text-xs text-emerald-600">正確：{answer.question.correct_answer}</span>
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <QuestionContentParagraphs
                      content={answer.question.content}
                      className="text-sm text-gray-700"
                      paragraphGapClass="mt-3"
                    />
                    {hasImage(answer.question) && (
                      <QuestionImage
                        src={getImagePublicUrl(answer.question)!}
                      />
                    )}
                    {answer.question.explanation ? (
                      <QuestionContentParagraphs
                        content={answer.question.explanation}
                        className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3"
                        paragraphGapClass="mt-2"
                      />
                    ) : (
                      <p className="text-sm text-gray-400 italic">沒有解釋</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-md"
          >
            返回列表
          </button>
        </div>

        <ContactFooter />
      </div>
    </div>
  );
}

function Spinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const sizeClass = size === "lg" ? "w-8 h-8" : "w-5 h-5";
  return (
    <svg
      className={`${sizeClass} animate-spin text-indigo-600`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function PaymentScreen({
  mobileNumber,
  tierStatus,
  onBack,
  onPaid,
}: {
  mobileNumber: string;
  tierStatus: ParentTierStatus;
  onBack: () => void;
  onPaid: () => void;
}) {
  const [discountCode, setDiscountCode] = useState("");
  const [discount, setDiscount] = useState<DiscountValidationResult | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsText, setTermsText] = useState("");
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(() => hasAirwallexSdk());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hasAirwallexSdk()) {
      setSdkReady(true);
      return;
    }
    const intervalId = window.setInterval(() => {
      if (hasAirwallexSdk()) {
        setSdkReady(true);
        window.clearInterval(intervalId);
      }
    }, 500);
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
    }, 15000);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  const originalPrice = MONTHLY_PAID_PRICE_HKD;
  const discountPercent = discount?.valid ? discount.discount_percent : 0;
  const finalAmount = Math.max(originalPrice * (1 - discountPercent / 100), 0);

  const validateDiscount = useCallback(async () => {
    const code = discountCode.trim().toUpperCase();
    if (!code) {
      setDiscount(null);
      return;
    }
    setValidatingCode(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc("validate_discount_code", {
        p_code: code,
      });
      if (rpcErr) throw rpcErr;
      setDiscount((data as DiscountValidationResult) ?? null);
    } catch {
      setDiscount({
        valid: false,
        code,
        discount_percent: 0,
        salesperson: null,
      });
    } finally {
      setValidatingCode(false);
    }
  }, [discountCode]);

  const openTerms = useCallback(async () => {
    setShowTerms(true);
    if (termsText || loadingTerms) return;
    setLoadingTerms(true);
    try {
      const resp = await fetch(
        getPaymentTermsUrl(),
        { cache: "no-store" }
      );
      const text = await resp.text();
      setTermsText(text);
    } catch {
      setTermsText("未能載入付款條款，請稍後再試。");
    } finally {
      setLoadingTerms(false);
    }
  }, [termsText, loadingTerms]);

  const handleConfirm = useCallback(async () => {
    if (!agreed) {
      setMsg("請先同意付款條款。");
      return;
    }
    setProcessing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/payment/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile_number: mobileNumber.trim(),
          discount_code: discount?.valid ? discount.code : null,
        }),
      });
      const payload = (await res.json()) as {
        checkout_url?: string;
        intent_id?: string;
        client_secret?: string;
        currency?: string;
        country_code?: string;
        final_amount_hkd?: number;
        airwallex_customer_id?: string;
        airwallex_env?: "demo" | "prod";
        airwallex_locale?: string;
        airwallex_available_methods?: string[];
        applepay_available?: boolean | null;
        payment_method?: string;
        methods?: string[];
        applepay_setup_warning?: string | null;
        message?: string;
        paid?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "未能建立付款訂單");
      if (payload.paid) {
        setMsg(payload.message || "付款成功，已升級月費用戶。");
        await onPaid();
        return;
      }
      let resolvedIntentId = payload.intent_id || null;
      let resolvedClientSecret = payload.client_secret || null;
      let resolvedCurrency = payload.currency || "HKD";
      let resolvedCountryCode = payload.country_code || "HK";
      const resolvedAirwallexEnv = payload.airwallex_env || getAirwallexEnv();
      let resolvedPaymentMethod = payload.payment_method || "all";
      if ((!resolvedIntentId || !resolvedClientSecret) && payload.checkout_url) {
        try {
          const parsed = new URL(payload.checkout_url, window.location.origin);
          resolvedIntentId = resolvedIntentId || parsed.searchParams.get("intent_id");
          resolvedClientSecret = resolvedClientSecret || parsed.searchParams.get("client_secret");
          resolvedCurrency = parsed.searchParams.get("currency") || resolvedCurrency;
          resolvedCountryCode = parsed.searchParams.get("country_code") || resolvedCountryCode;
          resolvedPaymentMethod =
            parsed.searchParams.get("payment_method") || resolvedPaymentMethod;
        } catch {
          // Ignore legacy URL parsing errors and fallback to redirect below.
        }
      }
      if (resolvedIntentId && resolvedClientSecret) {
        const sdkReadyNow = await waitForAirwallexSdkReady();
        if (!sdkReadyNow) {
          throw new Error("付款 SDK 尚未準備好，請稍候再試。");
        }
        const appBaseUrl =
          (process.env.NEXT_PUBLIC_APP_BASE_URL || "").trim().replace(/\/$/, "") ||
          window.location.origin;
        const resolvedLocale =
          (payload.airwallex_locale || "").trim() || "zh-HK";
        const resolvedFinalAmount =
          typeof payload.final_amount_hkd === "number" && Number.isFinite(payload.final_amount_hkd)
            ? Math.max(payload.final_amount_hkd, 0)
            : Math.max(finalAmount, 0);
        const methods =
          payload.methods && payload.methods.length > 0
            ? payload.methods
            : (() => {
                switch (resolvedPaymentMethod || "all") {
                  case "cards":
                    return ["card"];
                  case "apple_pay":
                    return ["applepay"];
                  case "google_pay":
                    return ["googlepay"];
                  case "alipay":
                    return ["alipayhk"];
                  case "wechat_pay":
                    return ["wechatpay"];
                  default:
                    return ["card", "applepay", "googlepay", "alipayhk", "wechatpay"];
                }
              })();
        if (payload.applepay_setup_warning && methods.includes("applepay")) {
          console.warn("[Airwallex Apple Pay setup warning]", payload.applepay_setup_warning);
        }
        if (methods.includes("applepay")) {
          const availableMethods = Array.isArray(payload.airwallex_available_methods)
            ? payload.airwallex_available_methods
            : [];
          if (payload.applepay_available === false) {
            console.warn(
              "[Airwallex Apple Pay diagnostics] applepay is not active for HKD/HK recurring. Available methods:",
              availableMethods
            );
          }
          const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
          const isSafari = /^((?!chrome|android|crios|fxios|edg|opr).)*safari/i.test(ua);
          if (!isSafari) {
            console.warn(
              "[Airwallex Apple Pay diagnostics] Apple Pay on web is only available on Safari browsers."
            );
          }
        }
        const applePayRequestOptions = methods.includes("applepay")
          ? {
              buttonType: "subscribe",
              existingPaymentMethodRequired: false,
              countryCode: resolvedCountryCode,
              totalPriceLabel: "GearUp 增分寶",
              lineItems: [
                {
                  label: "GearUp 增分寶月費會員",
                  amount: resolvedFinalAmount.toFixed(2),
                  type: "final",
                  paymentTiming: "recurring",
                  recurringPaymentStartDate: new Date(),
                  recurringPaymentIntervalUnit: "month",
                  recurringPaymentIntervalCount: 1,
                },
              ],
            }
          : undefined;
        const payments = await resolveAirwallexPaymentsApi(resolvedAirwallexEnv);
        payments.redirectToCheckout({
          intent_id: resolvedIntentId,
          client_secret: resolvedClientSecret,
          currency: resolvedCurrency,
          country_code: resolvedCountryCode,
          locale: resolvedLocale,
          mode: "recurring",
          submitType: "subscribe",
          customer_id: payload.airwallex_customer_id || undefined,
          methods,
          applePayRequestOptions,
          successUrl: `${appBaseUrl}/payment-callback?result=success&mobile=${encodeURIComponent(
            mobileNumber.trim()
          )}&intent_id=${encodeURIComponent(resolvedIntentId)}`,
          cancelUrl: `${appBaseUrl}/payment-callback?result=cancel&mobile=${encodeURIComponent(
            mobileNumber.trim()
          )}&intent_id=${encodeURIComponent(resolvedIntentId)}`,
        });
        return;
      }
      if (payload.checkout_url) {
        let isLegacyInternalBridge = false;
        try {
          const parsed = new URL(payload.checkout_url, window.location.origin);
          isLegacyInternalBridge = parsed.pathname === "/payment-airwallex";
        } catch {
          isLegacyInternalBridge = false;
        }
        if (isLegacyInternalBridge) {
          setMsg("系統正在同步付款資料，請再按一次「確認並前往 Airwallex 付款」。");
          return;
        }
        window.location.href = payload.checkout_url;
        return;
      }
      setMsg(payload.message || "已建立付款訂單，請稍後再試。");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "付款流程發生錯誤");
    } finally {
      setProcessing(false);
    }
  }, [agreed, discount, finalAmount, mobileNumber, onPaid]);

  const canPay = agreed && !processing && !validatingCode;
  return (
    <div className="min-h-screen bg-white/60 backdrop-blur-sm py-8 px-4" onContextMenu={preventContextMenu}>
      <Script
        src={AIRWALLEX_SDK_SRC}
        strategy="afterInteractive"
        onLoad={() => setSdkReady(hasAirwallexSdk())}
        onReady={() => setSdkReady(hasAirwallexSdk())}
        onError={() => setSdkReady(false)}
      />
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-indigo-600">返回</button>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            tierStatus.is_paid ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
          }`}>
            {tierStatus.is_paid ? "月費用戶" : "免費用戶"}
          </span>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">月費會員付款</h1>
          <p className="mt-1 text-sm text-gray-500">電話號碼：{mobileNumber}</p>

          <div className="mt-4 rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-800">月費會員（每月）</p>
            <p className="mt-1 text-2xl font-bold text-indigo-700">HKD $99</p>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">折扣碼</label>
            <div className="flex gap-2">
              <input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g, "").slice(0, 6))}
                placeholder="輸入6位折扣碼"
                className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <button
                type="button"
                onClick={validateDiscount}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                套用
              </button>
            </div>
            {validatingCode && <p className="mt-1 text-xs text-gray-500">驗證中...</p>}
            {discount && (
              <p className={`mt-1 text-xs ${discount.valid ? "text-emerald-600" : "text-red-500"}`}>
                {discount.valid
                  ? `折扣碼有效：${discount.discount_percent}%（負責銷售：${discount.salesperson || "—"}）`
                  : "折扣碼無效"}
              </p>
            )}
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
            <p>原價：HKD $99</p>
            <p>折扣：{discountPercent}%</p>
            <p className="mt-1 font-semibold text-gray-900">應付：HKD ${finalAmount.toFixed(2)}</p>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            付款方式將於 Airwallex 付款頁面中選擇。
          </p>

          <div className="mt-4 rounded-xl border border-gray-200 p-3">
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                本人確認已閱讀並同意本平台的
                <button
                  type="button"
                  onClick={openTerms}
                  className="ml-1 text-indigo-600 underline hover:text-indigo-700"
                >
                  付款條款及細則
                </button>
              </span>
            </label>
          </div>

          {msg && <p className="mt-3 text-sm text-gray-700">{msg}</p>}
          {!sdkReady && (
            <p className="mt-2 text-xs text-amber-600">
              付款元件載入中，如按鈕後未有反應請稍候 1-2 秒再試。
            </p>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canPay}
            className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold ${
              canPay ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-gray-200 text-gray-400"
            }`}
          >
            {processing ? "處理中..." : "確認並前往 Airwallex 付款"}
          </button>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-800">付款條款及細則</h2>
              <button onClick={() => setShowTerms(false)} className="text-sm text-gray-500 hover:text-gray-700">關閉</button>
            </div>
            <div className="max-h-[70vh] overflow-auto px-4 py-3">
              {loadingTerms ? (
                <p className="text-sm text-gray-500">載入中...</p>
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-gray-700">{termsText}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
