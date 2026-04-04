"use client";

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type {
  Student,
  Question,
  AnswerRecord,
  ParentWeight,
  StudentBalance,
} from "@/lib/types";

const QUESTION_COUNT = 10;
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
  | "login_student"
  | "login_pin"
  | "subject_select"
  | "quiz"
  | "results";

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
  weights: ParentWeight[]
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
            (activeTypes[wi].weight_percentage / totalWeight) * QUESTION_COUNT
          )
        );
        let picked = 0;
        for (const q of buckets[wi]) {
          if (picked >= quota || selected.length >= QUESTION_COUNT) break;
          if (!usedIds.has(q.id)) {
            selected.push(q);
            usedIds.add(q.id);
            picked++;
          }
        }
      }

      if (selected.length < QUESTION_COUNT) {
        const remainder = fisherYatesShuffle(
          all.filter((q) => !usedIds.has(q.id))
        );
        for (const q of remainder) {
          if (selected.length >= QUESTION_COUNT) break;
          selected.push(q);
        }
      }

      pool = selected.slice(0, QUESTION_COUNT);
      return applySpecialLimits(pool, all);
    }
  }

  return applySpecialLimits(fisherYatesShuffle(pool), all);
}

function applySpecialLimits(candidates: Question[], fullPool: Question[]): Question[] {
  const result: Question[] = [];
  const usedIds = new Set<string>();
  let shortCount = 0;
  let imageCount = 0;

  for (const q of candidates) {
    if (result.length >= QUESTION_COUNT) break;
    const sa = isShortAnswer(q);
    const img = hasImage(q);
    if (sa && shortCount >= MAX_SHORT_ANSWER) continue;
    if (img && imageCount >= MAX_IMAGE) continue;
    result.push(q);
    usedIds.add(q.id);
    if (sa) shortCount++;
    if (img) imageCount++;
  }

  if (result.length < QUESTION_COUNT) {
    const extras = fisherYatesShuffle(
      fullPool.filter(
        (q) =>
          !usedIds.has(q.id) && !isShortAnswer(q) && !hasImage(q)
      )
    );
    for (const q of extras) {
      if (result.length >= QUESTION_COUNT) break;
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
      setScreen("login_student");
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

  const handleSubjectSelect = useCallback(
    async (subject: string) => {
      if (!selectedStudent) return;
      setLoading(true);
      setError(null);
      try {
        const { data: bal } = await supabase
          .from("student_balances")
          .select("*")
          .eq("student_id", selectedStudent.id)
          .ilike("subject", subject)
          .maybeSingle();

        if (bal && (bal as StudentBalance).remaining_questions <= 0) {
          throw new Error("你的練習題目已用完，請聯絡家長充值。");
        }

        setBalance(bal as StudentBalance | null);
        setSelectedSubject(subject);
        await startQuiz(selectedStudent, subject);
      } catch (err) {
        setError(err instanceof Error ? err.message : "無法開始測驗。");
        setLoading(false);
      }
    },
    [selectedStudent]
  );

  const startQuiz = async (student: Student, subject: string) => {
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
        (weights as ParentWeight[]) || []
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
        await supabase.rpc("deduct_student_balance", {
          p_balance_id: balance.id,
          p_amount: finalAnswers.length,
        });
        setBalance({
          ...balance,
          remaining_questions: Math.max(0, balance.remaining_questions - finalAnswers.length),
        });
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

  if (screen === "results") {
    return (
      <ResultsView
        answers={answers}
        studentName={selectedStudent?.student_name || ""}
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
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col"
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
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">GearUp Quiz</h1>
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
  }) => void;
  onBack: () => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const [studentName, setStudentName] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [avatarStyle, setAvatarStyle] = useState<string>("");
  const [gradeLevel, setGradeLevel] = useState<string>("");

  const PIN_RE = /^[A-Za-z0-9]{6}$/;
  const pinValid = PIN_RE.test(pinCode);
  const canSubmit =
    mobileNumber.trim().length > 0 &&
    studentName.trim().length > 0 &&
    pinValid &&
    avatarStyle !== "" &&
    gradeLevel !== "";

  const grades = ["P1", "P2", "P3", "P4", "P5", "P6"];
  const avatars: { value: string; label: string; gradient: string }[] = [
    { value: "Boy", label: "男生", gradient: "from-blue-400 to-indigo-500" },
    { value: "Girl", label: "女生", gradient: "from-pink-400 to-rose-500" },
  ];

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4 py-8"
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
              家長電話號碼
            </label>
            <input
              type="tel"
              value={mobileNumber}
              onChange={(e) => {
                setMobileNumber(e.target.value);
                if (error) setError(null);
              }}
              placeholder="例如：91234567"
              className="w-full p-3.5 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-indigo-400 transition-colors"
            />
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
              PIN 碼（6位英數字混合）
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
              頭像
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

          {error && (
            <p className="text-sm text-red-500 font-medium">{error}</p>
          )}

          <button
            onClick={() =>
              onSubmit({ studentName: studentName.trim(), pinCode, avatarStyle, gradeLevel })
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
}: {
  students: Student[];
  onSelect: (s: Student) => void;
  onBack: () => void;
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
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4"
      onContextMenu={preventContextMenu}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">選擇學生</h1>
          <p className="mt-2 text-gray-500">請選擇你的名字</p>
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
}: {
  studentName: string;
  pin: string;
  setPin: (v: string) => void;
  onSubmit: () => void;
  error: string | null;
  setError: (v: string | null) => void;
  onBack: () => void;
}) {
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4"
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
            inputMode="numeric"
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
    { key: "Math", label: "數學", icon: "🔢" },
  ];
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4"
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
  onRestart,
  onLogout,
  balance,
}: {
  answers: AnswerRecord[];
  studentName: string;
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
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50"
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
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center"
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
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4"
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
