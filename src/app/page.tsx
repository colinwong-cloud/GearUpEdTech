"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase, isSupabaseBrowserConfigured } from "@/lib/supabase";
import type { Question, AnswerRecord } from "@/lib/types";
import { LoginAddToHomeButton } from "@/components/login-add-to-home-button";
import {
  getLoginBackgroundImageUrl,
  getLoginHeroLogoUrl,
  getLoginMarketingLogoUrl,
  getPlatformBriefTxtUrl,
} from "@/lib/login-marketing-assets";
import { decodeTraditionalChineseText } from "@/lib/decode-traditional-chinese-text";

const QUESTION_COUNT = 10;
const OPTION_LABELS = ["A", "B", "C", "D"] as const;
const OPTION_KEYS = ["opt_a", "opt_b", "opt_c", "opt_d"] as const;

type RpcStudentRow = {
  id: string;
  pin_code?: string | null;
  student_name?: string | null;
};

type AuthSession = {
  studentId: string;
  mobile: string;
  studentName: string;
};

type AuthPhase = "landing" | "quiz";

export default function QuizPage() {
  const [authPhase, setAuthPhase] = useState<AuthPhase>("landing");
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizComplete, setQuizComplete] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  const initializeQuiz = useCallback(async () => {
    setLoading(true);
    setError(null);
    setQuestions([]);
    setSessionId(null);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setAnswers([]);
    setQuizComplete(false);
    startTimeRef.current = Date.now();

    try {
      if (!authSession) {
        throw new Error("請先登入（電話及學生密碼）。");
      }

      const { count, error: countError } = await supabase
        .from("questions")
        .select("*", { count: "exact", head: true });

      if (countError) throw countError;
      if (!count || count === 0) throw new Error("No questions found in the database.");

      const { data: allQuestions, error: fetchError } = await supabase
        .from("questions")
        .select("*")
        .limit(QUESTION_COUNT * 3);

      if (fetchError) throw fetchError;
      if (!allQuestions || allQuestions.length === 0) {
        throw new Error("Failed to fetch questions.");
      }

      const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(QUESTION_COUNT, shuffled.length)) as Question[];
      const subject = selected[0]?.subject ?? "general";

      const { data: sessionJson, error: sessionError } = await supabase.rpc("create_quiz_session", {
        p_student_id: authSession.studentId,
        p_subject: subject,
      });

      if (sessionError) throw sessionError;
      const sessionRow = sessionJson as { id?: string } | null;
      const newSessionId =
        sessionRow && typeof sessionRow.id === "string" ? sessionRow.id : null;
      if (!newSessionId) {
        throw new Error("無法建立練習紀錄（create_quiz_session 回傳異常）。請確認 Supabase 已部署 RPC。");
      }

      setQuestions(selected);
      setSessionId(newSessionId);
    } catch (err: unknown) {
      if (!isSupabaseBrowserConfigured) {
        setError(
          "無法連線題庫：請在部署環境設定 NEXT_PUBLIC_SUPABASE_URL 及 NEXT_PUBLIC_SUPABASE_ANON_KEY（或設定 SUPABASE_URL / SUPABASE_ANON_KEY，建置時會一併注入）。"
        );
      } else {
        let msg = "Failed to load quiz. Please try again.";
        if (
          err &&
          typeof err === "object" &&
          "message" in err &&
          typeof (err as { message: unknown }).message === "string"
        ) {
          msg = (err as { message: string }).message;
        } else if (err instanceof Error) {
          msg = err.message;
        }
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [authSession]);

  useEffect(() => {
    if (authPhase !== "quiz") return;
    initializeQuiz();
  }, [authPhase, initializeQuiz]);

  const handleSubmitAnswer = async () => {
    if (!selectedAnswer || !sessionId || submitting) return;

    const currentQuestion = questions[currentIndex];
    const isCorrect = selectedAnswer === currentQuestion.correct_answer;

    setSubmitting(true);
    try {
      const { error: answerError } = await supabase.rpc("submit_answer", {
        p_session_id: sessionId,
        p_question_id: currentQuestion.id,
        p_student_answer: selectedAnswer,
        p_is_correct: isCorrect,
        p_question_order: currentIndex + 1,
      });

      if (answerError) throw answerError;

      const newAnswer: AnswerRecord = {
        question: currentQuestion,
        studentAnswer: selectedAnswer,
        isCorrect,
      };
      const updatedAnswers = [...answers, newAnswer];
      setAnswers(updatedAnswers);

      const newScore = updatedAnswers.filter((a) => a.isCorrect).length;
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);

      const { error: updateErr } = await supabase.rpc("update_quiz_session", {
        p_session_id: sessionId,
        p_questions_attempted: updatedAnswers.length,
        p_score: newScore,
        p_time_spent_seconds: timeSpent,
      });

      if (updateErr) throw updateErr;

      if (currentIndex + 1 >= questions.length) {
        setQuizComplete(true);
      } else {
        setCurrentIndex(currentIndex + 1);
        setSelectedAnswer(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer.");
    } finally {
      setSubmitting(false);
    }
  };

  const beginQuizAfterLogin = (session: AuthSession) => {
    setAuthSession(session);
    setAuthPhase("quiz");
  };

  if (authPhase === "landing") {
    return <ParentLoginLanding onLoginSuccess={beginQuizAfterLogin} />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <ErrorScreen error={error} onRetry={initializeQuiz} />;
  }

  if (quizComplete) {
    return (
      <ResultsView
        answers={answers}
        onRestart={() => {
          setAuthPhase("landing");
          setAuthSession(null);
          setQuizComplete(false);
          setError(null);
        }}
        onPlayAgain={() => {
          setQuizComplete(false);
          setError(null);
          void initializeQuiz();
        }}
      />
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    return <ErrorScreen error="No question available." onRetry={initializeQuiz} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl">
          <ProgressBar current={currentIndex + 1} total={questions.length} />

          <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 sm:px-8 sm:py-5">
              <p className="text-indigo-100 text-sm font-medium">
                Question {currentIndex + 1} of {questions.length}
              </p>
              <h2 className="mt-2 text-lg sm:text-xl font-semibold text-white leading-relaxed">
                {currentQuestion.content}
              </h2>
            </div>

            <div className="p-6 sm:p-8 space-y-3">
              {OPTION_LABELS.map((label, i) => {
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
                    <span className={`text-base ${isSelected ? "text-indigo-900 font-medium" : "text-gray-700"}`}>
                      {optionText}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-6 pb-6 sm:px-8 sm:pb-8">
              <button
                onClick={handleSubmitAnswer}
                disabled={!selectedAnswer || submitting}
                className={`w-full py-3.5 rounded-xl text-base font-semibold transition-all duration-200 ${
                  selectedAnswer && !submitting
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg active:scale-[0.98]"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Submitting...
                  </span>
                ) : currentIndex + 1 === questions.length ? (
                  "Submit & View Results"
                ) : (
                  "Submit Answer"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginBackgroundLayer() {
  const bgUrl = useMemo(() => getLoginBackgroundImageUrl(), []);
  if (!bgUrl) return null;
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-0 min-h-full overflow-hidden" aria-hidden>
        {/* Tiled + blurred (natural repeat); fills viewport */}
        <div
          className="absolute inset-0 blur-[14px] sm:blur-[18px]"
          style={{
            backgroundImage: `url("${bgUrl}")`,
            backgroundRepeat: "repeat",
            backgroundSize: "auto",
            backgroundPosition: "top left",
            minHeight: "100%",
            minWidth: "100%",
          }}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-white/35 backdrop-blur-[2px]"
        aria-hidden
      />
    </>
  );
}

function ParentLoginLanding({
  onLoginSuccess,
}: {
  onLoginSuccess: (session: AuthSession) => void;
}) {
  const [mobileNumber, setMobileNumber] = useState("");
  const [pin, setPin] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const canTryLogin =
    mobileNumber.trim().length > 0 && pin.trim().length > 0 && !loginBusy;
  const heroLogoUrl = getLoginHeroLogoUrl();

  const handleLogin = async () => {
    const mobile = mobileNumber.trim();
    const pinNorm = pin.trim();
    if (!mobile || !pinNorm) return;

    setLoginBusy(true);
    setLoginError(null);

    try {
      const { data, error } = await supabase.rpc("login_by_mobile", {
        p_mobile_number: mobile,
      });

      if (error) throw error;

      const payload = data as {
        parent_found?: boolean;
        students?: RpcStudentRow[] | null;
      };

      if (!payload?.parent_found) {
        throw new Error("找不到此電話號碼，請確認號碼是否與註冊時一致。");
      }

      const list = Array.isArray(payload.students) ? payload.students : [];
      const matched = list.filter(
        (s) => String(s.pin_code ?? "").trim().toLowerCase() === pinNorm.toLowerCase()
      );

      if (matched.length === 0) {
        throw new Error("密碼不正確，請重新輸入學生練習密碼。");
      }

      const student = matched[0]!;
      if (!student.id) {
        throw new Error("學生資料異常，請聯絡客服。");
      }

      onLoginSuccess({
        studentId: student.id,
        mobile,
        studentName: String(student.student_name ?? "").trim() || "同學",
      });
    } catch (e: unknown) {
      let msg = "登入失敗，請稍後再試。";
      if (e instanceof Error) msg = e.message;
      else if (e && typeof e === "object" && "message" in e) {
        msg = String((e as { message: unknown }).message);
      }
      setLoginError(msg);
    } finally {
      setLoginBusy(false);
    }
  };

  return (
    <div className="relative isolate min-h-[100dvh] overflow-hidden">
      <LoginBackgroundLayer />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 pb-28 pt-6 sm:pb-32 sm:pt-8">
        <div className="w-full max-w-sm self-center text-center">
          {heroLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroLogoUrl}
              alt="GearUp Quiz"
              className="mx-auto mb-4 h-auto w-full max-w-xs sm:max-w-sm"
              draggable={false}
            />
          ) : (
            <h1 className="mb-4 text-center text-2xl font-bold text-gray-800">GearUp Quiz</h1>
          )}
          <p className="text-gray-500">請輸入電話號碼及密碼登入</p>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">電話號碼</label>
              <input
                type="tel"
                autoComplete="username"
                value={mobileNumber}
                onChange={(e) => {
                  setMobileNumber(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                placeholder="例如：91234567"
                className="w-full rounded-xl border-2 border-gray-200 p-4 text-base outline-none transition-colors focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">密碼</label>
              <input
                type="password"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                placeholder="6 位英文或數字密碼"
                className="w-full rounded-xl border-2 border-gray-200 p-4 text-base outline-none transition-colors focus:border-indigo-400"
              />
            </div>

            {loginError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loginError}</p>
            )}

            <button
              type="button"
              disabled={!canTryLogin}
              onClick={() => void handleLogin()}
              className={`w-full rounded-xl py-3.5 text-base font-semibold transition-all duration-200 ${
                canTryLogin
                  ? "bg-indigo-600 text-white shadow-md hover:bg-indigo-700"
                  : "cursor-not-allowed bg-gray-200 text-gray-400"
              }`}
            >
              {loginBusy ? "登入中…" : "登入"}
            </button>

            <LoginAddToHomeButton />
          </div>
        </div>

        <div className="my-8 h-px w-full bg-gradient-to-r from-transparent via-gray-300 to-transparent" aria-hidden />

        <LoginMarketingLogoAndBrief />
      </div>

      <footer
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 border-t border-gray-200/70 bg-white/60 py-3 text-center backdrop-blur-sm"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <p className="pointer-events-auto text-[11px] text-gray-500/90 sm:text-xs">
          © 2026 GearUp EduTech Limited
        </p>
      </footer>
    </div>
  );
}

function LoginMarketingLogoAndBrief() {
  const logoUrl = getLoginMarketingLogoUrl();
  const briefUrl = getPlatformBriefTxtUrl();

  return (
    <div className="flex flex-col items-center">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="GearUp"
          className="h-auto w-full max-w-md px-2"
          draggable={false}
        />
      ) : null}

      <PlatformBriefPanel key={briefUrl ?? "none"} briefUrl={briefUrl} />
    </div>
  );
}

function PlatformBriefPanel({ briefUrl }: { briefUrl: string | null }) {
  const panelWrap =
    "mt-7 w-full max-w-lg rounded-[1.35rem] border border-amber-200/90 bg-gradient-to-br from-amber-50/98 via-orange-50/95 to-rose-50/90 px-5 py-6 shadow-[0_12px_40px_-12px_rgba(180,83,9,0.25)] ring-1 ring-amber-100/80 backdrop-blur-[2px] sm:px-7 sm:py-8";

  const [briefText, setBriefText] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(!!briefUrl);

  useEffect(() => {
    if (!briefUrl) return;
    let cancelled = false;
    fetch(briefUrl, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (!cancelled) setBriefText(decodeTraditionalChineseText(buf));
      })
      .catch(() => {
        if (!cancelled) setBriefError("無法載入平台簡介，請稍後再試。");
      })
      .finally(() => {
        if (!cancelled) setBriefLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefUrl]);

  if (!briefUrl) {
    return (
      <div
        className={panelWrap}
        style={{ fontFamily: "var(--font-noto-sans-tc), system-ui, sans-serif" }}
      >
        <p className="text-center text-sm text-amber-900/80">
          尚未設定平台簡介網址（請設定 NEXT_PUBLIC_SUPABASE_URL）。
        </p>
      </div>
    );
  }

  const paragraphs =
    briefText?.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) ?? [];

  return (
    <div className={panelWrap} style={{ fontFamily: "var(--font-noto-sans-tc), system-ui, sans-serif" }}>
      <div className="mb-4 flex items-center gap-2 border-b border-amber-200/70 pb-3">
        <span className="text-2xl leading-none" aria-hidden>
          ✨
        </span>
        <h2 className="text-lg font-semibold tracking-wide text-amber-950/95 sm:text-xl">歡迎來到 GearUp</h2>
      </div>
      {briefLoading && (
        <p className="text-center text-[15px] text-amber-900/70">載入平台簡介中…</p>
      )}
      {briefError && !briefLoading && (
        <p className="text-center text-sm font-medium text-red-700">{briefError}</p>
      )}
      {!briefLoading &&
        !briefError &&
        paragraphs.map((block, i) => (
          <p
            key={i}
            className={
              i === 0
                ? "text-[16px] font-medium leading-[1.75] text-stone-800 sm:text-[17px]"
                : "mt-5 text-[15px] leading-[1.8] text-stone-700/95 sm:text-base"
            }
          >
            <span className="whitespace-pre-line">{block}</span>
          </p>
        ))}
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = (current / total) * 100;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-medium text-gray-600">
        <span>Progress</span>
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
  onRestart,
  onPlayAgain,
}: {
  answers: AnswerRecord[];
  onRestart: () => void;
  onPlayAgain: () => void;
}) {
  const score = answers.filter((a) => a.isCorrect).length;
  const total = answers.length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className={`text-center p-6 sm:p-8 rounded-2xl border-2 ${scoreBg} mb-8`}>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Quiz Complete!</h1>
          <p className={`mt-3 text-4xl sm:text-5xl font-extrabold ${scoreColor}`}>
            {score} / {total}
          </p>
          <p className="mt-2 text-lg text-gray-600">{percentage}% correct</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider sm:px-6">
                    Question
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Your Answer
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Result
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider sm:px-6">
                    Explanation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {answers.map((answer, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-4 text-sm text-gray-700 sm:px-6 max-w-xs">
                      <span className="font-medium text-gray-500 mr-1">{i + 1}.</span>
                      {answer.question.content.length > 100
                        ? answer.question.content.slice(0, 100) + "..."
                        : answer.question.content}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                        {answer.studentAnswer}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      {answer.isCorrect ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium">
                          ✓ Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                          ✗ Wrong
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600 sm:px-6 max-w-sm">
                      {!answer.isCorrect && answer.question.explanation ? (
                        <div>
                          <p className="text-xs text-red-500 font-medium mb-1">
                            Correct: {answer.question.correct_answer}
                          </p>
                          <p>{answer.question.explanation}</p>
                        </div>
                      ) : answer.isCorrect ? (
                        <span className="text-gray-400 italic">—</span>
                      ) : (
                        <span className="text-gray-400 italic">No explanation available</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onPlayAgain}
            className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 font-semibold text-indigo-700 shadow-md ring-2 ring-indigo-200 transition-all hover:bg-indigo-50 sm:w-auto"
          >
            再練一次
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 font-semibold text-white shadow-md transition-all hover:bg-indigo-700 sm:w-auto"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            返回登入
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 mb-4">
          <Spinner size="lg" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800">Loading Quiz...</h2>
        <p className="mt-2 text-gray-500">Preparing your questions</p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-800">Something went wrong</h2>
        <p className="mt-2 text-gray-500">{error}</p>
        <button
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all duration-200"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

function Spinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const sizeClass = size === "lg" ? "w-8 h-8" : "w-5 h-5";
  return (
    <svg className={`${sizeClass} animate-spin text-indigo-600`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
