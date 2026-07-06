"use client";

import { useRouter, useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QuestionContentParagraphs } from "@/components/question-content-paragraphs";
import {
  OverallChart,
  TypeCharts,
  type ChartDataPayload,
} from "@/components/student-performance-charts";
import {
  CHINESE_QUIZ_SUBJECT,
  ENGLISH_QUIZ_SUBJECT,
  PRIMARY_QUIZ_SUBJECT,
  subjectDisplayLabel,
} from "@/lib/quiz-subjects";

type TutorStudentChart = {
  student_id: string;
  student_name: string;
  data: ChartDataPayload;
};

type TutorSessionSummary = {
  id: string;
  student_id: string;
  student_name: string;
  subject: string;
  questions_attempted: number;
  score: number;
  time_spent_seconds: number;
  created_at: string;
};

type SessionDetailQuestion = {
  content: string;
  explanation: string | null;
  opt_a: string | null;
  opt_b: string | null;
  opt_c: string | null;
  opt_d: string | null;
  correct_answer: string;
};

type SessionDetailAnswer = {
  student_answer: string;
  is_correct: boolean;
  question_order: number | null;
  question: SessionDetailQuestion;
};

type TutorSessionDetailPayload = {
  session: TutorSessionSummary;
  answers: SessionDetailAnswer[];
  student_name: string;
  registered_mobile: string;
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("zh-HK");
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  return mins > 0 ? `${mins} 分 ${secs} 秒` : `${secs} 秒`;
}

function normalizeChoiceKey(answer: string): "A" | "B" | "C" | "D" | null {
  const normalized = (answer || "").trim().toUpperCase();
  if (normalized === "A" || normalized === "B" || normalized === "C" || normalized === "D") {
    return normalized;
  }
  return null;
}

function getChoiceValueByKey(question: SessionDetailQuestion, key: "A" | "B" | "C" | "D"): string {
  if (key === "A") return question.opt_a ?? "";
  if (key === "B") return question.opt_b ?? "";
  if (key === "C") return question.opt_c ?? "";
  return question.opt_d ?? "";
}

function formatAnswerWithValue(question: SessionDetailQuestion, answer: string): string {
  const choiceKey = normalizeChoiceKey(answer);
  if (!choiceKey) return answer || "(空白)";
  const value = getChoiceValueByKey(question, choiceKey).trim();
  if (!value) return choiceKey;
  return `${choiceKey} (${value})`;
}

const SUBJECTS = [PRIMARY_QUIZ_SUBJECT, CHINESE_QUIZ_SUBJECT, ENGLISH_QUIZ_SUBJECT] as const;

export default function TutorStudentDetailPage() {
  const params = useParams<{ hash: string }>();
  const router = useRouter();

  const studentHash = String(params?.hash || "").trim();

  const [registeredMobile, setRegisteredMobile] = useState("");
  const [subject, setSubject] = useState<string>(PRIMARY_QUIZ_SUBJECT);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [sessions, setSessions] = useState<TutorSessionSummary[]>([]);
  const [charts, setCharts] = useState<TutorStudentChart[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TutorSessionDetailPayload | null>(null);
  const [msg, setMsg] = useState("");

  const ensureTutorSession = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/tutor/session", { method: "GET", cache: "no-store" });
    if (!res.ok) {
      router.replace("/tutor");
      return false;
    }
    const payload = (await res.json().catch(() => null)) as
      | { must_change_password?: boolean }
      | null;
    if (payload?.must_change_password) {
      router.replace("/tutor");
      return false;
    }
    return true;
  }, [router]);

  const loadSessions = useCallback(async () => {
    if (!studentHash) {
      setMsg("連結參數不正確。");
      setSessions([]);
      return;
    }
    setLoadingSessions(true);
    setMsg("");
    try {
      const ok = await ensureTutorSession();
      if (!ok) return;
      const res = await fetch(
        `/api/tutor/sessions?hash=${encodeURIComponent(studentHash)}&subject=${encodeURIComponent(
          subject
        )}&year=${monthCursor.year}&month=${monthCursor.month}`,
        { method: "GET", cache: "no-store" }
      );
      const payload = (await res.json().catch(() => null)) as
        | {
            data?: {
              sessions?: TutorSessionSummary[];
              registered_mobile?: string;
              charts?: TutorStudentChart[];
            };
            error?: string;
          }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error || "無法載入練習紀錄。");
      }
      setSessions(payload?.data?.sessions ?? []);
      setCharts(payload?.data?.charts ?? []);
      if (payload?.data?.registered_mobile) {
        setRegisteredMobile(String(payload.data.registered_mobile));
      }
      setDetail(null);
    } catch (err) {
      setSessions([]);
      setCharts([]);
      setDetail(null);
      setMsg(err instanceof Error ? err.message : "無法載入練習紀錄。");
    } finally {
      setLoadingSessions(false);
    }
  }, [ensureTutorSession, monthCursor.month, monthCursor.year, studentHash, subject]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleLogout = async () => {
    await fetch("/api/tutor/session", { method: "DELETE" }).catch(() => null);
    router.replace("/tutor");
  };

  const handleViewDetail = async (sessionId: string) => {
    setLoadingDetailId(sessionId);
    setMsg("");
    try {
      const ok = await ensureTutorSession();
      if (!ok) return;
      const res = await fetch(`/api/tutor/session-detail?session_id=${encodeURIComponent(sessionId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as
        | { data?: TutorSessionDetailPayload; error?: string }
        | null;
      if (!res.ok || !payload?.data) {
        throw new Error(payload?.error || "無法載入練習詳情。");
      }
      setDetail(payload.data);
    } catch (err) {
      setDetail(null);
      setMsg(err instanceof Error ? err.message : "無法載入練習詳情。");
    } finally {
      setLoadingDetailId(null);
    }
  };

  const monthLabel = `${monthCursor.year} 年 ${monthCursor.month} 月`;
  const summary = useMemo(() => {
    const totalSessions = sessions.length;
    const totalQuestions = sessions.reduce((sum, row) => sum + row.questions_attempted, 0);
    const totalCorrect = sessions.reduce((sum, row) => sum + row.score, 0);
    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    return { totalSessions, totalQuestions, totalCorrect, accuracy };
  }, [sessions]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-gray-800">練習記錄（登記手機：{registeredMobile}）</h1>
        </div>

        {msg && <p className="text-sm text-red-500">{msg}</p>}

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((subjectKey) => (
              <button
                key={subjectKey}
                onClick={() => setSubject(subjectKey)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  subject === subjectKey
                    ? "bg-indigo-600 text-white"
                    : "border border-gray-200 text-gray-600 hover:border-indigo-300"
                }`}
              >
                {subjectDisplayLabel(subjectKey)}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() =>
                setMonthCursor((prev) =>
                  prev.month === 1
                    ? { year: prev.year - 1, month: 12 }
                    : { year: prev.year, month: prev.month - 1 }
                )
              }
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              上月
            </button>
            <span className="text-sm font-semibold text-gray-700">{monthLabel}</span>
            <button
              onClick={() =>
                setMonthCursor((prev) =>
                  prev.month === 12
                    ? { year: prev.year + 1, month: 1 }
                    : { year: prev.year, month: prev.month + 1 }
                )
              }
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              下月
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">練習次數</p>
            <p className="mt-1 text-2xl font-bold text-indigo-600">{summary.totalSessions}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">總題數</p>
            <p className="mt-1 text-2xl font-bold text-gray-800">{summary.totalQuestions}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">答對題數</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{summary.totalCorrect}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">平均正確率</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{summary.accuracy}%</p>
          </div>
        </div>

        {charts.length > 0 && (
          <div className="space-y-6">
            {charts.map((c) => (
              <div key={c.student_id} className="space-y-2">
                {charts.length > 1 && (
                  <p className="text-sm font-semibold text-gray-700">
                    {c.student_name}（{subjectDisplayLabel(subject)}）
                  </p>
                )}
                <OverallChart chartData={c.data} />
                {c.data.type_sessions.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-gray-700">各題型正確率趨勢</p>
                    <TypeCharts chartData={c.data} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-3">日期時間</th>
                <th className="py-2 pr-3">學生</th>
                <th className="py-2 pr-3">分數</th>
                <th className="py-2 pr-3">正確率</th>
                <th className="py-2 pr-3">用時</th>
                <th className="py-2 pr-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((row) => {
                const pct =
                  row.questions_attempted > 0
                    ? Math.round((row.score / row.questions_attempted) * 100)
                    : 0;
                return (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3">{formatDateTime(row.created_at)}</td>
                    <td className="py-2 pr-3">{row.student_name}</td>
                    <td className="py-2 pr-3">
                      {row.score} / {row.questions_attempted}
                    </td>
                    <td className="py-2 pr-3">{pct}%</td>
                    <td className="py-2 pr-3">{formatDuration(row.time_spent_seconds)}</td>
                    <td className="py-2 pr-3">
                      <button
                        onClick={() => handleViewDetail(row.id)}
                        disabled={Boolean(loadingDetailId)}
                        className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {loadingDetailId === row.id ? "載入中..." : "查看詳情"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sessions.length === 0 && !loadingSessions && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-400">
                    本月暫無練習紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {detail && (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">
                練習詳情（{detail.student_name}）
              </h2>
              <p className="text-sm text-gray-500">
                登記手機：{detail.registered_mobile} ｜ 科目：{subjectDisplayLabel(detail.session.subject)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-slate-50 p-3 text-sm text-gray-700">
              日期時間：{formatDateTime(detail.session.created_at)} ｜ 分數：{detail.session.score} /{" "}
              {detail.session.questions_attempted} ｜ 用時：
              {formatDuration(detail.session.time_spent_seconds)}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-3 w-10">#</th>
                    <th className="py-2 pr-3">你的答案</th>
                    <th className="py-2 pr-3">結果</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.answers.map((row, idx) => (
                    <tr key={`${idx}-${row.question_order ?? idx}`} className="border-b border-gray-100">
                      <td className="py-2 pr-3">{idx + 1}</td>
                      <td className="py-2 pr-3">
                        {formatAnswerWithValue(row.question, row.student_answer || "")}
                      </td>
                      <td className="py-2 pr-3">
                        {row.is_correct ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            正確
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            錯誤
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail.answers.filter((row) => !row.is_correct).length > 0 && (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-gray-800">錯題解析</h3>
                {detail.answers
                  .map((row, idx) => ({ row, idx }))
                  .filter(({ row }) => !row.is_correct)
                  .map(({ row, idx }) => (
                    <div key={idx} className="rounded-xl border border-red-100 bg-red-50/40 p-3 space-y-2">
                      <p className="text-sm font-semibold text-red-700">第 {idx + 1} 題</p>
                      <div className="rounded-lg border border-gray-100 bg-white p-3">
                        <p className="text-xs font-semibold text-gray-500">題目內容</p>
                        <QuestionContentParagraphs
                          content={row.question.content || ""}
                          className="mt-2 text-sm text-gray-700"
                          paragraphGapClass="mt-2"
                        />
                      </div>
                      <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                        <p className="text-xs font-semibold text-red-600">你的答案（含值）</p>
                        <p className="mt-1 text-sm text-red-700">
                          {formatAnswerWithValue(row.question, row.student_answer || "")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                        <p className="text-xs font-semibold text-emerald-700">正確答案（含值）</p>
                        <p className="mt-1 text-sm text-emerald-700">
                          {formatAnswerWithValue(row.question, row.question.correct_answer || "")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs font-semibold text-gray-500">解釋</p>
                        {row.question.explanation ? (
                          <QuestionContentParagraphs
                            content={row.question.explanation}
                            className="mt-2 text-sm text-gray-600"
                            paragraphGapClass="mt-2"
                          />
                        ) : (
                          <p className="mt-2 text-sm text-gray-400">沒有解釋</p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div className="text-right">
              <button
                onClick={() => setDetail(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                收起詳情
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={() => router.push("/tutor")}
              className="w-full rounded-xl border border-sky-200 bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-200 sm:w-auto"
            >
              返回導師主頁
            </button>
            <button
              onClick={handleLogout}
              className="w-full rounded-xl border border-sky-200 bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-200 sm:w-auto"
            >
              登出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
