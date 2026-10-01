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
import { filenameFromContentDisposition, hktMonthLabel } from "@/lib/tutor-practice-paper";
import { redirectToTutorPlanCheckout } from "@/lib/tutor-plan-checkout";

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

type PracticePaperRow = {
  id: string;
  student_name: string;
  registered_mobile: string;
  grade_level: string;
  subject: string;
  subject_label: string;
  month_key: string;
  created_at: string;
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

type ComparisonCohort = {
  average: number | null;
  count: number;
  rank: number | null;
};

type StudentComparisonPayload = {
  locked: boolean;
  monthlyPriceHkd: number;
  gradeLabel: string;
  schoolName: string;
  district: string;
  comparison?: {
    studentAccuracy: number | null;
    school: ComparisonCohort | null;
    district: ComparisonCohort | null;
    grade: ComparisonCohort;
  };
  selected?: ComparisonCohort | null;
  selectedGradeLabel?: string;
  selectedSchoolName?: string;
};

type ComparisonSchool = {
  id: string;
  area: string;
  district: string;
  name: string;
};

const COMPARE_GRADES = [
  ["P1", "小一"],
  ["P2", "小二"],
  ["P3", "小三"],
  ["P4", "小四"],
  ["P5", "小五"],
  ["P6", "小六"],
] as const;

function formatComparisonPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value}%`;
}

function formatComparisonRank(cohort: ComparisonCohort | null | undefined): string {
  if (!cohort || cohort.rank === null) return "—";
  return `第 ${cohort.rank} / ${cohort.count}`;
}

export default function TutorStudentDetailPage() {
  const params = useParams<{ hash: string }>();
  const router = useRouter();

  const studentHash = String(params?.hash || "").trim();

  const [registeredMobile, setRegisteredMobile] = useState("");
  const [studentName, setStudentName] = useState("");
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
  const [papers, setPapers] = useState<PracticePaperRow[]>([]);
  const [paperUsed, setPaperUsed] = useState(0);
  const [paperLimit, setPaperLimit] = useState(4);
  const [paperMonthKey, setPaperMonthKey] = useState("");
  const [paperMsg, setPaperMsg] = useState("");
  const [generatingPaper, setGeneratingPaper] = useState(false);
  const [comparison, setComparison] = useState<StudentComparisonPayload | null>(null);
  const [comparisonMsg, setComparisonMsg] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [comparisonSchools, setComparisonSchools] = useState<ComparisonSchool[]>([]);
  const [compareGrade, setCompareGrade] = useState("");
  const [compareArea, setCompareArea] = useState("");
  const [compareDistrict, setCompareDistrict] = useState("");
  const [compareSchoolId, setCompareSchoolId] = useState("");

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
              student_name?: string;
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
      if (payload?.data?.student_name) {
        setStudentName(String(payload.data.student_name));
      }
      setDetail(null);
    } catch (err) {
      setSessions([]);
      setCharts([]);
      setStudentName("");
      setDetail(null);
      setMsg(err instanceof Error ? err.message : "無法載入練習紀錄。");
    } finally {
      setLoadingSessions(false);
    }
  }, [ensureTutorSession, monthCursor.month, monthCursor.year, studentHash, subject]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadPapers = useCallback(async () => {
    if (!studentHash) return;
    try {
      const res = await fetch("/api/tutor/practice-papers/overview", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as
        | {
            data?: {
              month_key?: string;
              used?: number;
              limit?: number;
              papers?: PracticePaperRow[];
            };
            error?: string;
          }
        | null;
      if (!res.ok) throw new Error(payload?.error || "無法載入練習卷。");
      setPapers(payload?.data?.papers ?? []);
      setPaperUsed(Number(payload?.data?.used ?? 0));
      setPaperLimit(Number(payload?.data?.limit ?? 4));
      setPaperMonthKey(String(payload?.data?.month_key ?? ""));
    } catch (err) {
      setPaperMsg(err instanceof Error ? err.message : "無法載入練習卷。");
    }
  }, [studentHash]);

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  const loadComparison = useCallback(async () => {
    if (!studentHash) return;
    setLoadingComparison(true);
    setComparisonMsg("");
    try {
      const params = new URLSearchParams({ hash: studentHash, subject });
      if (compareGrade && compareSchoolId) {
        params.set("compareGrade", compareGrade);
        params.set("compareSchoolId", compareSchoolId);
      }
      const res = await fetch(`/api/tutor/student-comparison?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as
        | { data?: StudentComparisonPayload; error?: string }
        | null;
      if (!res.ok || !payload?.data) {
        throw new Error(payload?.error || "無法載入同學對比。");
      }
      setComparison(payload.data);
    } catch (err) {
      setComparison(null);
      setComparisonMsg(err instanceof Error ? err.message : "無法載入同學對比。");
    } finally {
      setLoadingComparison(false);
    }
  }, [compareGrade, compareSchoolId, studentHash, subject]);

  useEffect(() => {
    if (!studentHash) return;
    let cancelled = false;
    const loadSchools = async () => {
      try {
        const res = await fetch("/api/tutor/comparison-schools", { method: "GET", cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as
          | { data?: { schools?: ComparisonSchool[] } }
          | null;
        if (!res.ok || cancelled) return;
        setComparisonSchools(payload?.data?.schools ?? []);
      } catch {
        if (!cancelled) setComparisonSchools([]);
      }
    };
    void loadSchools();
    return () => {
      cancelled = true;
    };
  }, [studentHash]);

  useEffect(() => {
    loadComparison();
  }, [loadComparison]);

  const handleGeneratePaper = async () => {
    setGeneratingPaper(true);
    setPaperMsg("");
    try {
      const res = await fetch("/api/tutor/practice-papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: studentHash, subject }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { data?: { used?: number; limit?: number }; error?: string }
        | null;
      if (!res.ok) throw new Error(payload?.error || "未能生成練習卷。");
      setPaperUsed(Number(payload?.data?.used ?? paperUsed));
      setPaperLimit(Number(payload?.data?.limit ?? paperLimit));
      setPaperMsg("練習卷已生成，可下載學生卷及答案卷。");
      await loadPapers();
    } catch (err) {
      setPaperMsg(err instanceof Error ? err.message : "未能生成練習卷。");
    } finally {
      setGeneratingPaper(false);
    }
  };

  const downloadPaper = async (paperId: string, kind: "student" | "answer") => {
    setPaperMsg("");
    try {
      const res = await fetch(`/api/tutor/practice-papers/${paperId}/pdf?kind=${kind}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "未能下載 PDF。");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromContentDisposition(
        res.headers.get("Content-Disposition"),
        kind === "answer" ? "gearup-practice-answer.pdf" : "gearup-practice-student.pdf"
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPaperMsg(err instanceof Error ? err.message : "未能下載 PDF。");
    }
  };

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
      const res = await fetch(
        `/api/tutor/session-detail?session_id=${encodeURIComponent(sessionId)}&hash=${encodeURIComponent(
          studentHash
        )}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );
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
    <div className="min-h-screen bg-white/60 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-gray-800">
            練習記錄（學生：{studentName || "—"}｜登記手機：{registeredMobile || "—"}）
          </h1>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push("/tutor")}
              className="rounded-xl border border-sky-200 bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-200"
            >
              返回
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-sky-200 bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-200"
            >
              登出
            </button>
          </div>
        </div>

        {msg && <p className="text-sm text-red-500">{msg}</p>}

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-800">離線練習卷</h2>
              <p className="mt-1 text-sm text-gray-500">
                按目前科目及這位學生的年級抽出 30 題。每月可生成 {paperLimit} 份，全部學生合計，學生卷及答案卷計作 1 份。列表只顯示近 180 日的練習卷。
              </p>
              <p className="mt-2 text-sm font-semibold text-indigo-800">
                {paperMonthKey ? hktMonthLabel(paperMonthKey) : "本月"}已生成 {paperUsed} / {paperLimit} 份，尚餘{" "}
                {Math.max(0, paperLimit - paperUsed)} 份。
              </p>
            </div>
            <button
              type="button"
              onClick={handleGeneratePaper}
              disabled={generatingPaper || paperUsed >= paperLimit}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {generatingPaper ? "生成中..." : "生成練習卷"}
            </button>
          </div>
          {paperMsg && (
            <p
              className={`rounded-xl border px-3 py-2 text-sm ${
                paperMsg.includes("已生成")
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {paperMsg}
            </p>
          )}
          {papers.length === 0 ? (
            <p className="text-sm text-gray-400">近 180 日尚未生成練習卷。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-3">日期</th>
                    <th className="py-2 pr-3">學生</th>
                    <th className="py-2 pr-3">登記手機</th>
                    <th className="py-2 pr-3">科目</th>
                    <th className="py-2 pr-3">下載</th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map((paper) => (
                    <tr key={paper.id} className="border-b border-gray-100">
                      <td className="py-2 pr-3">{formatDateTime(paper.created_at)}</td>
                      <td className="py-2 pr-3">{paper.student_name || "學生"}</td>
                      <td className="py-2 pr-3 font-mono">{paper.registered_mobile || "—"}</td>
                      <td className="py-2 pr-3">{paper.subject_label}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => downloadPaper(paper.id, "student")}
                          className="mr-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700"
                        >
                          學生卷
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPaper(paper.id, "answer")}
                          className="rounded-lg border border-sky-200 bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700"
                        >
                          答案卷
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
          <div>
            <h2 className="text-base font-bold text-gray-800">同學對比</h2>
            <p className="mt-1 text-sm text-gray-500">
              以最近 10 次練習的平均正確率，比較這位學生與同年級同學。範圍包括同校、同區，以及全部同年級。亦可另選一個年級和學校來比較。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-gray-600">
              比較年級
              <select
                value={compareGrade}
                onChange={(event) => setCompareGrade(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-800"
              >
                <option value="">請選擇</option>
                {COMPARE_GRADES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-600">
              地區
              <select
                value={compareArea}
                onChange={(event) => {
                  setCompareArea(event.target.value);
                  setCompareDistrict("");
                  setCompareSchoolId("");
                }}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-800"
              >
                <option value="">請選擇</option>
                {[...new Set(comparisonSchools.map((school) => school.area).filter(Boolean))].map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-600">
              分區
              <select
                value={compareDistrict}
                onChange={(event) => {
                  setCompareDistrict(event.target.value);
                  setCompareSchoolId("");
                }}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-800"
              >
                <option value="">請選擇</option>
                {[...new Set(
                  comparisonSchools
                    .filter((school) => school.area === compareArea)
                    .map((school) => school.district)
                    .filter(Boolean)
                )].map((districtName) => (
                  <option key={districtName} value={districtName}>
                    {districtName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-600">
              比較學校
              <select
                value={compareSchoolId}
                onChange={(event) => setCompareSchoolId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-800"
              >
                <option value="">請選擇</option>
                {comparisonSchools
                  .filter((school) => school.area === compareArea && school.district === compareDistrict)
                  .map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {loadingComparison && <p className="text-sm text-gray-400">載入同學對比中...</p>}
          {comparisonMsg && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {comparisonMsg}
            </p>
          )}
          {comparison?.locked && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                同學對比屬導師進階版（HK${comparison.monthlyPriceHkd}/月）。以下是示例，並非這位學生的真實數據。進階版生效後會顯示
                {comparison.gradeLabel ? ` ${comparison.gradeLabel}` : "同年級"}
                {comparison.schoolName ? `、${comparison.schoolName}` : ""}
                {comparison.district ? `、${comparison.district}` : ""}
                的真實比較。
              </div>
              <button
                type="button"
                disabled={planLoading}
                onClick={async () => {
                  setPlanLoading(true);
                  setComparisonMsg("");
                  try {
                    await redirectToTutorPlanCheckout();
                  } catch (err) {
                    setComparisonMsg(err instanceof Error ? err.message : "未能建立付款。");
                    setPlanLoading(false);
                  }
                }}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {planLoading ? "前往付款..." : "前往 Airwallex 付款"}
              </button>
              <div className="overflow-x-auto rounded-xl border border-dashed border-amber-300">
                <div className="bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">示例</div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="px-3 py-2 pr-3">範圍</th>
                      <th className="py-2 pr-3">平均正確率</th>
                      <th className="py-2 pr-3">人數</th>
                      <th className="py-2 pr-3">這位學生排名</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-indigo-100 bg-indigo-50/60">
                      <td className="px-3 py-2 pr-3 font-semibold text-indigo-900">
                        所選
                        {COMPARE_GRADES.find(([value]) => value === compareGrade)?.[1] || "年級"}
                        {comparisonSchools.find((school) => school.id === compareSchoolId)?.name
                          ? ` · ${comparisonSchools.find((school) => school.id === compareSchoolId)?.name}`
                          : " · 所選學校"}
                      </td>
                      <td className="py-2 pr-3">71%</td>
                      <td className="py-2 pr-3">36</td>
                      <td className="py-2 pr-3">第 8 / 36</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-3 py-2 pr-3 font-semibold text-gray-800">這位學生</td>
                      <td className="py-2 pr-3">78%</td>
                      <td className="py-2 pr-3">—</td>
                      <td className="py-2 pr-3">—</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-3 py-2 pr-3">
                        同校同年級{comparison.schoolName ? `（${comparison.schoolName}）` : ""}
                      </td>
                      <td className="py-2 pr-3">74%</td>
                      <td className="py-2 pr-3">28</td>
                      <td className="py-2 pr-3">第 6 / 28</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-3 py-2 pr-3">
                        同區同年級{comparison.district ? `（${comparison.district}）` : ""}
                      </td>
                      <td className="py-2 pr-3">69%</td>
                      <td className="py-2 pr-3">210</td>
                      <td className="py-2 pr-3">第 40 / 210</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 pr-3">
                        全部同年級{comparison.gradeLabel ? `（${comparison.gradeLabel}）` : ""}
                      </td>
                      <td className="py-2 pr-3">66%</td>
                      <td className="py-2 pr-3">980</td>
                      <td className="py-2 pr-3">第 180 / 980</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {comparison && !comparison.locked && comparison.comparison && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-3">範圍</th>
                    <th className="py-2 pr-3">平均正確率</th>
                    <th className="py-2 pr-3">人數</th>
                    <th className="py-2 pr-3">這位學生排名</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.selected && (
                    <tr className="border-b border-indigo-100 bg-indigo-50/60">
                      <td className="py-2 pr-3 font-semibold text-indigo-900">
                        所選{comparison.selectedGradeLabel || "年級"}
                        {comparison.selectedSchoolName ? ` · ${comparison.selectedSchoolName}` : ""}
                      </td>
                      <td className="py-2 pr-3">{formatComparisonPct(comparison.selected.average)}</td>
                      <td className="py-2 pr-3">{comparison.selected.count}</td>
                      <td className="py-2 pr-3">{formatComparisonRank(comparison.selected)}</td>
                    </tr>
                  )}
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-semibold text-gray-800">這位學生</td>
                    <td className="py-2 pr-3">{formatComparisonPct(comparison.comparison.studentAccuracy)}</td>
                    <td className="py-2 pr-3">—</td>
                    <td className="py-2 pr-3">—</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-3">同校同年級{comparison.schoolName ? `（${comparison.schoolName}）` : ""}</td>
                    <td className="py-2 pr-3">{formatComparisonPct(comparison.comparison.school?.average)}</td>
                    <td className="py-2 pr-3">{comparison.comparison.school?.count ?? "—"}</td>
                    <td className="py-2 pr-3">{formatComparisonRank(comparison.comparison.school)}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-3">同區同年級{comparison.district ? `（${comparison.district}）` : ""}</td>
                    <td className="py-2 pr-3">{formatComparisonPct(comparison.comparison.district?.average)}</td>
                    <td className="py-2 pr-3">{comparison.comparison.district?.count ?? "—"}</td>
                    <td className="py-2 pr-3">{formatComparisonRank(comparison.comparison.district)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">全部同年級{comparison.gradeLabel ? `（${comparison.gradeLabel}）` : ""}</td>
                    <td className="py-2 pr-3">{formatComparisonPct(comparison.comparison.grade.average)}</td>
                    <td className="py-2 pr-3">{comparison.comparison.grade.count}</td>
                    <td className="py-2 pr-3">{formatComparisonRank(comparison.comparison.grade)}</td>
                  </tr>
                </tbody>
              </table>
              {!comparison.schoolName && (
                <p className="mt-2 text-sm text-gray-500">這位學生尚未設定學校，所以未能比較同校或同區。</p>
              )}
            </div>
          )}
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
      </div>
    </div>
  );
}
