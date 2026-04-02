"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Question, AnswerRecord } from "@/lib/types";

const QUESTION_COUNT = 10;
const OPTION_LABELS = ["A", "B", "C", "D"] as const;
const OPTION_KEYS = ["opt_a", "opt_b", "opt_c", "opt_d"] as const;
const SUPABASE_PAGE_SIZE = 1000;

function isShortAnswer(q: Question): boolean {
  return q.opt_a == null && q.opt_b == null && q.opt_c == null && q.opt_d == null;
}

async function fetchAllQuestions(): Promise<Question[]> {
  const all: Question[] = [];
  let from = 0;
  let keepGoing = true;
  while (keepGoing) {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Question[]));
    if (data.length < SUPABASE_PAGE_SIZE) {
      keepGoing = false;
    } else {
      from += SUPABASE_PAGE_SIZE;
    }
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

function preventContextMenu(e: React.MouseEvent) {
  e.preventDefault();
}

export default function QuizPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(true);
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
    setTextAnswer("");
    setAnswers([]);
    setQuizComplete(false);
    startTimeRef.current = Date.now();

    try {
      const allQuestions = await fetchAllQuestions();
      if (allQuestions.length === 0) throw new Error("No questions found in the database.");

      const shuffled = fisherYatesShuffle(allQuestions);
      const selected = shuffled.slice(0, Math.min(QUESTION_COUNT, shuffled.length));

      const { data: session, error: sessionError } = await supabase
        .from("quiz_sessions")
        .insert({
          subject: selected[0]?.subject ?? "general",
          questions_attempted: 0,
          score: 0,
          time_spent_seconds: 0,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      setQuestions(selected);
      setSessionId((session as { id: string }).id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quiz. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeQuiz();
  }, [initializeQuiz]);

  const handleSubmitAnswer = async () => {
    const currentQuestion = questions[currentIndex];
    const shortAnswer = isShortAnswer(currentQuestion);
    const answer = shortAnswer ? textAnswer.trim() : selectedAnswer;

    if (!answer || !sessionId || submitting) return;

    const isCorrect = shortAnswer
      ? answer.toLowerCase() === currentQuestion.correct_answer.toLowerCase()
      : answer === currentQuestion.correct_answer;

    setSubmitting(true);
    try {
      const { error: answerError } = await supabase.from("session_answers").insert({
        session_id: sessionId,
        question_id: currentQuestion.id,
        student_answer: answer,
        is_correct: isCorrect,
      });

      if (answerError) throw answerError;

      const newAnswer: AnswerRecord = {
        question: currentQuestion,
        studentAnswer: answer,
        isCorrect,
      };
      const updatedAnswers = [...answers, newAnswer];
      setAnswers(updatedAnswers);

      const newScore = updatedAnswers.filter((a) => a.isCorrect).length;
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);

      await supabase
        .from("quiz_sessions")
        .update({
          questions_attempted: updatedAnswers.length,
          score: newScore,
          time_spent_seconds: timeSpent,
        })
        .eq("id", sessionId);

      if (currentIndex + 1 >= questions.length) {
        setQuizComplete(true);
      } else {
        setCurrentIndex(currentIndex + 1);
        setSelectedAnswer(null);
        setTextAnswer("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <ErrorScreen error={error} onRetry={initializeQuiz} />;
  }

  if (quizComplete) {
    return <ResultsView answers={answers} onRestart={initializeQuiz} />;
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    return <ErrorScreen error="No question available." onRetry={initializeQuiz} />;
  }

  const shortAnswer = isShortAnswer(currentQuestion);
  const canSubmit = shortAnswer ? textAnswer.trim().length > 0 : selectedAnswer != null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col" onContextMenu={preventContextMenu}>
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
                    placeholder=""
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
                      <span className={`text-base ${isSelected ? "text-indigo-900 font-medium" : "text-gray-700"}`}>
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

function ResultsView({ answers, onRestart }: { answers: AnswerRecord[]; onRestart: () => void }) {
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50" onContextMenu={preventContextMenu}>
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
                {answers.map((answer, i) => {
                  const shortAns = isShortAnswer(answer.question);
                  return (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td className="px-4 py-4 text-sm text-gray-700 sm:px-6 max-w-xs">
                        <span className="font-medium text-gray-500 mr-1">{i + 1}.</span>
                        {answer.question.content.length > 100
                          ? answer.question.content.slice(0, 100) + "..."
                          : answer.question.content}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {shortAns ? (
                          <span className="inline-block px-3 py-1 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 max-w-[200px] truncate">
                            {answer.studentAnswer}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                            {answer.studentAnswer}
                          </span>
                        )}
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
                          <div>
                            <p className="text-xs text-red-500 font-medium mb-1">
                              Correct: {answer.question.correct_answer}
                            </p>
                            <span className="text-gray-400 italic">No explanation available</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={onRestart}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg active:scale-[0.98]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Start New Quiz
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center" onContextMenu={preventContextMenu}>
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center px-4" onContextMenu={preventContextMenu}>
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
