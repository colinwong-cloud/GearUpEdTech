"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
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

const MAX_SHORT_ANSWER = 2;
const MAX_IMAGE = 1;
const OPTION_LABELS = ["A", "B", "C", "D"] as const;
const OPTION_KEYS = ["opt_a", "opt_b", "opt_c", "opt_d"] as const;
const SUPABASE_PAGE_SIZE = 1000;
const STORAGE_BUCKET = "question-images";
const STORAGE_PATH_RE = /\/storage\/v1\/object\/public\/question-images\/(.+)$/;

type AppScreen =
  | "login_mobile"
  | "register"
  | "login_role"
  | "login_student"
  | "login_pin"
  | "subject_select"
  | "question_count_select"
  | "quiz"
  | "results"
  | "parent_pin"
  | "parent_dashboard"
  | "parent_session_detail"
  | "profile_pin"
  | "profile_edit"
  | "add_student_pin"
  | "add_student_form"
  | "parent_student_select"
  | "forgot_password";

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

interface BalanceTransaction {
  id: string;
  change_amount: number;
  balance_after: number;
  description: string;
  session_id: string | null;
  created_at: string;
}

interface BalanceTransactionData {
  opening_balance: number;
  current_balance: number;
  transactions: BalanceTransaction[];
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
  const path = match ? match[1] : q.image_url;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function fetchAllQuestions(
  subject: string,
  gradeLevel: string
): Promise<Question[]> {
  const all: Question[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .ilike("subject", subject)
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
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const [parentSessions, setParentSessions] = useState<SessionSummary[]>([]);
  const [parentMonth, setParentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [parentSubject, setParentSubject] = useState("數學");
  const [parentDetailSession, setParentDetailSession] = useState<SessionSummary | null>(null);
  const [parentDetailAnswers, setParentDetailAnswers] = useState<SessionDetailAnswer[]>([]);
  const [parentBalanceData, setParentBalanceData] = useState<BalanceTransactionData | null>(null);
  const [chartData, setChartData] = useState<ChartDataPayload | null>(null);

  const handleMobileSubmit = useCallback(async () => {
    if (!mobileNumber.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("login_by_mobile", {
        p_mobile_number: mobileNumber.trim(),
      });
      if (rpcErr) throw rpcErr;

      const result = data as { parent_found: boolean; students: Student[] };
      if (!result.parent_found)
        throw new Error("找不到此電話號碼的帳戶，請先註冊。");
      if (!result.students || result.students.length === 0)
        throw new Error("此帳戶下沒有學生，請先註冊。");

      setStudents(result.students);
      setScreen("login_role");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗，請重試。");
    } finally {
      setLoading(false);
    }
  }, [mobileNumber]);

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
        setScreen("subject_select");
      } catch (err) {
        setError(err instanceof Error ? err.message : "註冊失敗，請重試。");
      } finally {
        setLoading(false);
      }
    },
    [mobileNumber]
  );

  const handleStudentSelect = useCallback((student: Student) => {
    setSelectedStudent(student);
    if (student.pin_code) {
      setPinInput("");
      setScreen("login_pin");
    } else {
      setScreen("subject_select");
    }
  }, []);

  const handlePinSubmit = useCallback(() => {
    if (!selectedStudent) return;
    if (pinInput === selectedStudent.pin_code) {
      setError(null);
      setScreen("subject_select");
    } else {
      setError("PIN 碼不正確，請重試。");
    }
  }, [pinInput, selectedStudent]);

  const handleParentPinSubmit = useCallback(() => {
    const firstStudent = students[0];
    if (!firstStudent) return;
    if (pinInput === firstStudent.pin_code) {
      setError(null);
      if (students.length > 1) {
        setScreen("parent_student_select");
      } else {
        setSelectedStudent(firstStudent);
        loadParentSessions(firstStudent.id, parentSubject, parentMonth.year, parentMonth.month);
      }
    } else {
      setError("PIN 碼不正確，請重試。");
    }
  }, [pinInput, students, parentSubject, parentMonth]);

  const handleProfilePinSubmit = useCallback(() => {
    const firstStudent = students[0];
    if (!firstStudent) return;
    if (pinInput === firstStudent.pin_code) {
      setError(null);
      setScreen("profile_edit");
    } else {
      setError("PIN 碼不正確，請重試。");
    }
  }, [pinInput, students]);

  const handleAddStudentPinSubmit = useCallback(() => {
    const firstStudent = students[0];
    if (!firstStudent) return;
    if (pinInput === firstStudent.pin_code) {
      setError(null);
      setScreen("add_student_form");
    } else {
      setError("PIN 碼不正確，請重試。");
    }
  }, [pinInput, students]);

  const handleAddStudentSubmit = useCallback(
    async (form: { studentName: string; pinCode: string; avatarStyle: string; gradeLevel: string; schoolId: string | null }) => {
      if (!mobileNumber.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcErr } = await supabase.rpc("add_student_to_parent", {
          p_mobile_number: mobileNumber.trim(),
          p_student_name: form.studentName,
          p_pin_code: form.pinCode,
          p_avatar_style: form.avatarStyle,
          p_grade_level: form.gradeLevel,
          p_school_id: form.schoolId,
        });
        if (rpcErr) throw rpcErr;
        if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
        const newStudent = data as Student;
        setStudents((prev) => [...prev, newStudent]);
        setScreen("login_role");
      } catch (err) {
        setError(err instanceof Error ? err.message : "新增學生失敗，請重試。");
      } finally {
        setLoading(false);
      }
    },
    [mobileNumber]
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
      const [sessRes, balRes, chartRes] = await Promise.all([
        supabase.rpc("get_parent_sessions", {
          p_student_id: studentId,
          p_subject: subject,
          p_year: year,
          p_month: month,
        }),
        supabase.rpc("get_balance_transactions", {
          p_student_id: studentId,
          p_subject: subject,
          p_year: year,
          p_month: month,
        }),
        supabase.rpc("get_student_chart_data", {
          p_student_id: studentId,
        }),
      ]);
      if (sessRes.error) throw sessRes.error;
      setParentSessions((sessRes.data as SessionSummary[]) || []);
      setParentBalanceData(balRes.data as BalanceTransactionData | null);
      setChartData(chartRes.data as ChartDataPayload | null);
      setScreen("parent_dashboard");
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
    setSelectedAnswer(null);
    setTextAnswer("");
    setAnswers([]);
    startTimeRef.current = Date.now();

    try {
      const allQuestions = await fetchAllQuestions(subject, student.grade_level);
      if (allQuestions.length === 0)
        throw new Error("題庫中沒有找到適合的題目。");

      const { data: weights } = await supabase
        .from("parent_weights")
        .select("*")
        .eq("student_id", student.id)
        .ilike("subject", subject);

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
      setScreen("quiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入測驗。");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    const currentQuestion = questions[currentIndex];
    const shortAns = isShortAnswer(currentQuestion);
    const answer = shortAns ? textAnswer.trim() : selectedAnswer;
    if (!answer || !sessionId || submitting) return;

    const isCorrect = shortAns
      ? answer.toLowerCase() === currentQuestion.correct_answer.toLowerCase()
      : answer === currentQuestion.correct_answer;

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

      if (currentIndex + 1 >= questions.length) {
        await finalizeQuiz(updatedAnswers);
        setScreen("results");
      } else {
        setCurrentIndex(currentIndex + 1);
        setSelectedAnswer(null);
        setTextAnswer("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交答案失敗。");
    } finally {
      setSubmitting(false);
    }
  };

  const finalizeQuiz = async (finalAnswers: AnswerRecord[]) => {
    if (!selectedStudent || !selectedSubject) return;
    try {
      if (balance) {
        const { data: deductResult } = await supabase.rpc("deduct_student_balance", {
          p_balance_id: balance.id,
          p_amount: finalAnswers.length,
          p_session_id: sessionId,
        });
        const newBal = (deductResult as { remaining_questions: number } | null)?.remaining_questions
          ?? Math.max(0, balance.remaining_questions - finalAnswers.length);
        setBalance({ ...balance, remaining_questions: newBal });
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
        }),
      }).catch(() => {});
    } catch {
      // non-critical: don't block results
    }
  };

  const handleRestart = () => {
    setScreen("subject_select");
    setQuestions([]);
    setSessionId(null);
    setAnswers([]);
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
    setError(null);
  };

  if (loading) return <LoadingScreen />;

  if (screen === "login_mobile") {
    return (
      <LoginMobileScreen
        mobileNumber={mobileNumber}
        setMobileNumber={setMobileNumber}
        onSubmit={handleMobileSubmit}
        onRegister={() => {
          setError(null);
          setScreen("register");
        }}
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
          setPinInput("");
          setError(null);
          setScreen("parent_pin");
        }}
        onProfile={() => {
          setPinInput("");
          setError(null);
          setScreen("profile_pin");
        }}
        onAddStudent={() => {
          setPinInput("");
          setError(null);
          setScreen("add_student_pin");
        }}
        onBack={handleLogout}
      />
    );
  }

  if (screen === "profile_pin") {
    return (
      <PinScreen
        studentName="更新資料"
        pin={pinInput}
        setPin={setPinInput}
        onSubmit={handleProfilePinSubmit}
        error={error}
        setError={setError}
        onBack={() => setScreen("login_role")}
        onForgotPassword={() => { setError(null); setScreen("forgot_password"); }}
      />
    );
  }

  if (screen === "profile_edit") {
    return (
      <ProfileEditScreen
        mobileNumber={mobileNumber}
        onSaved={() => {
          setScreen("login_role");
        }}
        onBack={() => setScreen("login_role")}
      />
    );
  }

  if (screen === "add_student_pin") {
    return (
      <PinScreen
        studentName="新增學生"
        pin={pinInput}
        setPin={setPinInput}
        onSubmit={handleAddStudentPinSubmit}
        error={error}
        setError={setError}
        onBack={() => setScreen("login_role")}
        onForgotPassword={() => { setError(null); setScreen("forgot_password"); }}
      />
    );
  }

  if (screen === "add_student_form") {
    return (
      <AddStudentScreen
        mobileNumber={mobileNumber}
        existingPinCode={students[0]?.pin_code || ""}
        onSubmit={handleAddStudentSubmit}
        onBack={() => setScreen("login_role")}
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

  if (screen === "parent_pin") {
    return (
      <PinScreen
        studentName="家長"
        pin={pinInput}
        setPin={setPinInput}
        onSubmit={handleParentPinSubmit}
        error={error}
        setError={setError}
        onBack={() => setScreen("login_role")}
        onForgotPassword={() => { setError(null); setScreen("forgot_password"); }}
      />
    );
  }

  if (screen === "parent_dashboard") {
    return (
      <ParentDashboard
        studentName={selectedStudent?.student_name || ""}
        sessions={parentSessions}
        year={parentMonth.year}
        month={parentMonth.month}
        subject={parentSubject}
        balanceData={parentBalanceData}
        chartData={chartData}
        onMonthChange={handleParentMonthChange}
        onSubjectChange={(s) => {
          setParentSubject(s);
          if (selectedStudent) loadParentSessions(selectedStudent.id, s, parentMonth.year, parentMonth.month);
        }}
        onViewDetail={handleViewSessionDetail}
        onBack={() => setScreen("login_role")}
        onLogout={handleLogout}
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
        onBack={handleLogout}
      />
    );
  }

  if (screen === "login_pin") {
    return (
      <PinScreen
        studentName={selectedStudent?.student_name || ""}
        pin={pinInput}
        setPin={setPinInput}
        onSubmit={handlePinSubmit}
        error={error}
        setError={setError}
        onBack={() => setScreen("login_student")}
        onForgotPassword={() => { setError(null); setScreen("forgot_password"); }}
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
        subject={selectedSubject || ""}
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
  const canSubmit = shortAnswer
    ? textAnswer.trim().length > 0
    : selectedAnswer != null;

  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex flex-col"
      onContextMenu={preventContextMenu}
    >
      <Header
        studentName={selectedStudent?.student_name}
        onLogout={handleLogout}
      />
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl">
          <ProgressBar current={currentIndex + 1} total={questions.length} />

          <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 sm:px-8 sm:py-5">
              <p className="text-indigo-100 text-sm font-medium">
                第 {currentIndex + 1} 題 / 共 {questions.length} 題
              </p>
              <h2 className="mt-2 text-lg sm:text-xl font-semibold text-white leading-relaxed">
                {currentQuestion.content}
              </h2>
              {hasImage(currentQuestion) && (
                <QuestionImage src={getImagePublicUrl(currentQuestion)!} />
              )}
            </div>

            <div className="p-6 sm:p-8 space-y-3">
              {shortAnswer ? (
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    請輸入答案
                  </label>
                  <input
                    type="text"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    disabled={submitting}
                    className={`w-full p-4 rounded-xl border-2 text-base transition-all duration-200 outline-none ${
                      textAnswer.trim()
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-200 focus:border-indigo-400"
                    } ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                </div>
              ) : (
                OPTION_LABELS.map((label, i) => {
                  const optionText = currentQuestion[OPTION_KEYS[i]];
                  const isSelected = selectedAnswer === label;
                  return (
                    <button
                      key={label}
                      onClick={() => setSelectedAnswer(label)}
                      disabled={submitting}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-4 group ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-50 shadow-md"
                          : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
                      } ${submitting ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span
                        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 ${
                          isSelected
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-600 group-hover:bg-indigo-100 group-hover:text-indigo-600"
                        }`}
                      >
                        {label}
                      </span>
                      <span
                        className={`text-base ${isSelected ? "text-indigo-900 font-medium" : "text-gray-700"}`}
                      >
                        {optionText}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-6 pb-6 sm:px-8 sm:pb-8">
              <button
                onClick={handleSubmitAnswer}
                disabled={!canSubmit || submitting}
                className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${
                  canSubmit && !submitting
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg active:scale-[0.98]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    提交中...
                  </span>
                ) : currentIndex + 1 === questions.length ? (
                  "提交並查看結果"
                ) : (
                  "提交答案"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
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
  onSubmit,
  onRegister,
  error,
  setError,
}: {
  mobileNumber: string;
  setMobileNumber: (v: string) => void;
  onSubmit: () => void;
  onRegister: () => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-images/Banana%20images/GearUplogo.png`}
            alt="GearUp Quiz"
            className="mx-auto w-full max-w-xs sm:max-w-sm h-auto mb-4"
            draggable={false}
          />
          <p className="mt-2 text-gray-500">請輸入家長電話號碼登入</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              電話號碼
            </label>
            <input
              type="tel"
              value={mobileNumber}
              onChange={(e) => {
                setMobileNumber(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder="例如：91234567"
              className="w-full p-4 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400 transition-colors"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500 font-medium">{error}</p>
          )}
          <button
            onClick={onSubmit}
            disabled={!mobileNumber.trim()}
            className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${
              mobileNumber.trim()
                ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            登入
          </button>
          <div className="text-center pt-2 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              還沒有帳戶？{" "}
              <button
                onClick={onRegister}
                className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors"
              >
                新用戶註冊
              </button>
            </p>
          </div>
        </div>
      </div>
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

  const PIN_RE = /^[A-Za-z0-9]{6}$/;
  const pinValid = PIN_RE.test(pinCode);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const canSubmit =
    /^\d{8}$/.test(mobileNumber.trim()) &&
    studentName.trim().length > 0 &&
    pinValid &&
    avatarStyle !== "" &&
    gradeLevel !== "" &&
    selectedSchoolId !== null &&
    email.trim().length > 0 &&
    (siteKey ? turnstileToken !== null : true);

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
                mobileNumber.length > 0 && mobileNumber.length !== 8
                  ? "border-red-300 focus:border-red-400"
                  : "border-gray-200 focus:border-indigo-400"
              }`}
            />
            {mobileNumber.length > 0 && mobileNumber.length !== 8 && (
              <p className="mt-1 text-xs text-red-500">請輸入8位數字電話號碼</p>
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
                onSuccess={(token) => setTurnstileToken(token)}
                onError={() => setTurnstileToken(null)}
                onExpire={() => setTurnstileToken(null)}
                options={{ theme: "light", size: "normal" }}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 font-medium">{error}</p>
          )}

          <button
            onClick={() =>
              onSubmit({ studentName: studentName.trim(), pinCode, avatarStyle, gradeLevel, email: email.trim(), schoolId: selectedSchoolId })
            }
            disabled={!canSubmit}
            className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${
              canSubmit
                ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            完成註冊
          </button>

          <button
            onClick={onBack}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
          >
            返回登入
          </button>
        </div>
      </div>
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

function PinScreen({
  studentName,
  pin,
  setPin,
  onSubmit,
  error,
  setError,
  onBack,
  onForgotPassword,
}: {
  studentName: string;
  pin: string;
  setPin: (v: string) => void;
  onSubmit: () => void;
  error: string | null;
  setError: (v: string | null) => void;
  onBack: () => void;
  onForgotPassword?: () => void;
}) {
  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            你好，{studentName}
          </h1>
          <p className="mt-2 text-gray-500">請輸入你的 PIN 碼</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
          <input
            type="password"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            placeholder="PIN 碼"
            className="w-full p-4 rounded-xl border-2 border-gray-200 text-center text-2xl tracking-[0.5em] outline-none focus:border-indigo-400 transition-colors"
          />
          {error && (
            <p className="text-sm text-red-500 font-medium text-center">
              {error}
            </p>
          )}
          <button
            onClick={onSubmit}
            disabled={!pin}
            className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${
              pin
                ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            確認
          </button>
          <button
            onClick={onBack}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
          >
            返回
          </button>
          {onForgotPassword && (
            <button
              onClick={onForgotPassword}
              className="w-full text-center text-xs text-indigo-500 hover:text-indigo-700"
            >
              忘記密碼？
            </button>
          )}
        </div>
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
  const subjects = [
    { key: "數學", label: "數學", icon: "🔢" },
  ];
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
  subject,
  balance,
  onSelect,
  onBack,
  error,
}: {
  studentName: string;
  subject: string;
  balance: number | null;
  onSelect: (count: number) => void;
  onBack: () => void;
  error: string | null;
}) {
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
            {subject} — 請選擇本次練習的題目數量
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

function ProgressBar({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const percent = (current / total) * 100;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-medium text-gray-600">
        <span>進度</span>
        <span>
          {current} / {total}
        </span>
      </div>
      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ResultsView({
  answers,
  studentName,
  studentId,
  sessionId,
  onRestart,
  onLogout,
  balance,
}: {
  answers: AnswerRecord[];
  studentName: string;
  studentId: string | null;
  sessionId: string | null;
  onRestart: () => void;
  onLogout: () => void;
  balance: StudentBalance | null;
}) {
  const score = answers.filter((a) => a.isCorrect).length;
  const total = answers.length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

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
                    <p className="text-sm text-gray-700">
                      {answer.question.content}
                    </p>
                    {answer.question.explanation ? (
                      <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                        {answer.question.explanation}
                      </p>
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
  existingPinCode,
  onSubmit,
  onBack,
  error,
  setError,
}: {
  mobileNumber: string;
  existingPinCode: string;
  onSubmit: (form: { studentName: string; pinCode: string; avatarStyle: string; gradeLevel: string; schoolId: string | null }) => void;
  onBack: () => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const [studentName, setStudentName] = useState("");
  const [avatarStyle, setAvatarStyle] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

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
    (siteKey ? turnstileToken !== null : true);

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
              <Turnstile siteKey={siteKey} onSuccess={(token) => setTurnstileToken(token)} onError={() => setTurnstileToken(null)} onExpire={() => setTurnstileToken(null)} options={{ theme: "light", size: "normal" }} />
            </div>
          )}

          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
            提示：新增的學生將會共用現有的題目餘額。
          </p>

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

          <button onClick={() => onSubmit({ studentName: studentName.trim(), pinCode: existingPinCode, avatarStyle, gradeLevel, schoolId: selectedSchoolId })}
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
  const [studentEdits, setStudentEdits] = useState<{
    id: string;
    student_name: string;
    pin_code: string;
    avatar_style: string;
    grade_level: string;
    school_id: string | null;
  }[]>([]);

  const [schools, setSchools] = useState<{ id: string; area: string; district: string; name_zh: string | null; name_en: string }[]>([]);
  const [schoolAreas, setSchoolAreas] = useState<Record<string, string>>({});
  const [schoolDistricts, setSchoolDistricts] = useState<Record<string, string>>({});

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
          students: { id: string; student_name: string; pin_code: string; avatar_style: string; grade_level: string; school_id: string | null }[];
        };
        setParentId(d.parent.id);
        setParentName(d.parent.parent_name || "");
        setParentEmail(d.parent.email || "");
        setStudentEdits(d.students.map((s) => ({ ...s, pin_code: s.pin_code || "" })));
      }
      setLoading(false);
    })();
  }, [mobileNumber]);

  const updateStudent = (idx: number, field: string, value: string | null) => {
    setStudentEdits((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
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
          p_pin_code: s.pin_code,
          p_avatar_style: s.avatar_style,
          p_grade_level: s.grade_level,
          p_school_id: s.school_id,
        });
      }

      setMsg("資料已更新");
      setTimeout(onSaved, 1000);
    } catch {
      setMsg("儲存失敗，請重試");
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

        {studentEdits.map((s, idx) => (
          <div key={s.id} className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 space-y-4">
            <h2 className="text-base font-bold text-gray-800">學生資料 {studentEdits.length > 1 ? `(${idx + 1})` : ""}</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">學生姓名</label>
              <input value={s.student_name} onChange={(e) => updateStudent(idx, "student_name", e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">密碼（6 位英文或數字）</label>
              <input value={s.pin_code} onChange={(e) => updateStudent(idx, "pin_code", e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6))}
                maxLength={6}
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

function OverallChart({ chartData }: { chartData: ChartDataPayload }) {
  const overallAvg = chartData.grade_averages.find((g) => g.question_type === "_overall");
  const data = [...chartData.sessions].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((s) => {
    const d = new Date(s.created_at);
    return { date: `${d.getMonth() + 1}/${d.getDate()}`, pct: s.correct_pct };
  });

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 mb-4">
      <h3 className="text-sm font-bold text-gray-800 mb-3">整體正確率趨勢（最近30次）</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip formatter={(v) => [`${v}%`, "正確率"]} />
          {overallAvg && (
            <ReferenceLine y={Number(overallAvg.avg_correct_pct)} stroke="#f59e0b" strokeDasharray="5 5"
              label={{ value: `同級平均 ${overallAvg.avg_correct_pct}%`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }} />
          )}
          <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={pctColor(entry.pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
  const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  return (
    <div className="mt-3 space-y-4">
      {types.map((type, idx) => {
        const sessions = chartData.type_sessions
          .filter((t) => t.question_type === type)
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        const data = sessions.map((s) => {
          const d = new Date(s.created_at);
          return { date: `${d.getMonth() + 1}/${d.getDate()}`, pct: s.correct_pct };
        });
        const avg = avgMap.get(type);
        const color = colors[idx % colors.length];

        return (
          <div key={type} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h4 className="text-xs font-bold text-gray-700 mb-2">{type}</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => [`${v}%`, "正確率"]} />
                {avg !== undefined && (
                  <ReferenceLine y={avg} stroke="#f59e0b" strokeDasharray="5 5"
                    label={{ value: `平均${avg}%`, position: "insideTopRight", fontSize: 9, fill: "#f59e0b" }} />
                )}
                <Bar dataKey="pct" fill={color} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

function ContactFooter() {
  return (
    <div className="mt-8 py-4 border-t border-gray-200 text-center">
      <p className="text-xs text-gray-400">
        有問題或意見？請聯絡{" "}
        <a href="mailto:colin.wong@hkedutech.com" className="text-indigo-500 hover:text-indigo-600">
          colin.wong@hkedutech.com
        </a>
      </p>
    </div>
  );
}

function RoleSelectScreen({
  onStudent,
  onParent,
  onProfile,
  onAddStudent,
  onBack,
}: {
  onStudent: () => void;
  onParent: () => void;
  onProfile: () => void;
  onAddStudent: () => void;
  onBack: () => void;
}) {
  return (
    <div
      className="min-h-screen bg-white/60 backdrop-blur-sm flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">選擇身份</h1>
          <p className="mt-2 text-gray-500">請選擇登入身份</p>
        </div>
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
            onClick={onProfile}
            className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xl">
              ⚙️
            </div>
            <div className="text-left">
              <p className="text-base font-semibold text-gray-900">更新資料</p>
              <p className="text-sm text-gray-500">修改個人及學生資料</p>
            </div>
          </button>
          <button
            onClick={onAddStudent}
            className="w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-xl">
              👦
            </div>
            <div className="text-left">
              <p className="text-base font-semibold text-gray-900">新增學生</p>
              <p className="text-sm text-gray-500">在此帳戶下新增學生</p>
            </div>
          </button>
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

function ParentDashboard({
  studentName,
  sessions,
  year,
  month,
  subject,
  balanceData,
  chartData,
  onMonthChange,
  onSubjectChange,
  onViewDetail,
  onBack,
  onLogout,
}: {
  studentName: string;
  sessions: SessionSummary[];
  year: number;
  month: number;
  subject: string;
  balanceData: BalanceTransactionData | null;
  chartData: ChartDataPayload | null;
  onMonthChange: (y: number, m: number) => void;
  onSubjectChange: (s: string) => void;
  onViewDetail: (s: SessionSummary) => void;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [txExpanded, setTxExpanded] = useState(false);
  const [chartsExpanded, setChartsExpanded] = useState(false);
  const subjects = [{ key: "數學", label: "數學" }];
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
        {balanceData && (
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-md p-5 mb-4 flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-xs font-medium">題目餘額</p>
              <p className="text-white text-3xl font-extrabold">{balanceData.current_balance}</p>
            </div>
            <div className="text-right">
              <p className="text-indigo-200 text-xs">剩餘可用題目</p>
            </div>
          </div>
        )}

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

        {chartData && chartData.type_sessions.length > 0 && (
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

        {balanceData && balanceData.transactions.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setTxExpanded(!txExpanded)}
              className="w-full flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 hover:shadow-md transition-all"
            >
              <span className="text-sm font-semibold text-gray-700">題目餘額變動記錄</span>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${txExpanded ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {txExpanded && (
              <div className="mt-2 bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">日期</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">描述</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">變動</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">餘額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 text-xs text-gray-400">{month}/1</td>
                      <td className="px-3 py-2 text-xs text-gray-400">月初餘額</td>
                      <td className="px-3 py-2 text-xs text-gray-400 text-right">—</td>
                      <td className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">{balanceData.opening_balance}</td>
                    </tr>
                    {balanceData.transactions.map((tx) => {
                      const d = new Date(tx.created_at);
                      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                      const isPositive = tx.change_amount > 0;
                      return (
                        <tr key={tx.id}>
                          <td className="px-3 py-2 text-xs text-gray-500">{dateStr}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{tx.description}</td>
                          <td className={`px-3 py-2 text-xs font-semibold text-right ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                            {isPositive ? "+" : ""}{tx.change_amount}
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold text-gray-700 text-right">{tx.balance_after}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
          <p className="text-sm text-gray-500">{dateStr} · {session.subject} · 用時 {timeStr}</p>
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
                    <p className="text-sm text-gray-700">{answer.question.content}</p>
                    {answer.question.explanation ? (
                      <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">{answer.question.explanation}</p>
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
