"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false }
);
const ComposedChart = dynamic(
  () => import("recharts").then((m) => m.ComposedChart),
  { ssr: false }
);
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false }
);
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const Legend = dynamic(() => import("recharts").then((m) => m.Legend), { ssr: false });

type TodayPayload = {
  hkt_date: string;
  students_practice_distinct: number;
  sessions_by_subject: Record<string, number>;
  questions_by_subject: Record<string, number>;
  new_students_today: number;
  free_tier_new_users_today?: number;
  paid_tier_new_users_today?: number;
};

type TrendPoint = {
  y: number;
  m: number;
  key: string;
  registrations: number;
  practice_students: number;
  parent_views: number;
  male: number;
  female: number;
  undisclosed: number;
  free_tier_new_users?: number;
  paid_tier_new_users?: number;
};

type SchoolByGrade = {
  id: string;
  name: string;
  district: string;
  area: string;
  by_grade: Record<string, number>;
};

type MonthlyPayload = {
  through_hkt: string;
  mt_year: number;
  mt_month: number;
  mt_new_students: number;
  mt_practice_sessions: number;
  mt_session_answers: number;
  mt_practice_students: number;
  mt_parent_views: number;
  mt_new_free_tier_users?: number;
  mt_new_paid_tier_users?: number;
  alltime_students: number;
  alltime_parents: number;
  alltime_practice_sessions: number;
  alltime_session_answers: number;
  trend_12m: TrendPoint[];
  available_districts: string[];
};

type SchoolDetailsPayload = {
  district: string;
  school_id: string | null;
  schools_students_by_grade: SchoolByGrade[];
  school_monthly_correct_pct: { key: string; by_school_id: Record<string, number> }[];
  subject_monthly_correct_pct?: {
    key: string;
    chinese: number;
    english: number;
    math: number;
  }[];
  registrations_by_grade_12m?: Array<{
    key: string;
    P1: number;
    P2: number;
    P3: number;
    P4: number;
    P5: number;
    P6: number;
  }>;
};

function subjectEntries(obj: Record<string, number> | null | undefined) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
}

export function BusinessKpiSection({ sessionToken }: { sessionToken: string }) {
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPayload | null>(null);
  const [schoolDetails, setSchoolDetails] = useState<SchoolDetailsPayload | null>(null);
  const [tLoading, setTLoading] = useState(true);
  const [mLoading, setMLoading] = useState(true);
  const [sLoading, setSLoading] = useState(false);
  const [tErr, setTErr] = useState("");
  const [mErr, setMErr] = useState("");
  const [sErr, setSErr] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("__all__");

  const loadToday = useCallback(async () => {
    setTLoading(true);
    setTErr("");
    try {
      const res = await fetch("/api/admin/business-today", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
      });
      const j = (await res.json()) as { data?: TodayPayload; error?: string };
      if (!res.ok) throw new Error(j.error || "無法載入");
      setToday((j.data as TodayPayload) ?? null);
    } catch (e) {
      setTErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setTLoading(false);
    }
  }, [sessionToken]);

  const loadMonthly = useCallback(async () => {
    setMLoading(true);
    setMErr("");
    try {
      const res = await fetch("/api/admin/business-monthly", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
      });
      const j = (await res.json()) as { data?: MonthlyPayload; error?: string };
      if (!res.ok) throw new Error(j.error || "無法載入");
      setMonthly((j.data as MonthlyPayload) ?? null);
    } catch (e) {
      setMErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setMLoading(false);
    }
  }, [sessionToken]);

  const loadSchoolDetails = useCallback(async () => {
    if (!selectedDistrict) {
      setSErr("請先選擇地區。");
      return;
    }
    setSLoading(true);
    setSErr("");
    try {
      const res = await fetch("/api/admin/business-school-details", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          district: selectedDistrict,
          school_id: selectedSchoolId === "__all__" ? null : selectedSchoolId,
        }),
      });
      const j = (await res.json()) as {
        data?: SchoolDetailsPayload;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || "無法載入學校資料");
      setSchoolDetails((j.data as SchoolDetailsPayload) ?? null);
    } catch (e) {
      setSErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setSLoading(false);
    }
  }, [selectedDistrict, selectedSchoolId, sessionToken]);

  useEffect(() => {
    void loadToday();
    void loadMonthly();
  }, [loadToday, loadMonthly]);

  const districts = useMemo(() => {
    const arr = monthly?.available_districts;
    if (!Array.isArray(arr)) return [] as string[];
    return [...arr].sort((a, b) => a.localeCompare(b, "zh-HK"));
  }, [monthly]);

  const schoolOptions = useMemo(() => {
    const s = schoolDetails?.schools_students_by_grade;
    if (!s || !Array.isArray(s)) return [];
    return [...s].sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  }, [schoolDetails]);

  const monthRows = useMemo(() => {
    const t = monthly?.trend_12m;
    if (!t || !Array.isArray(t)) return [];
    return [...t]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((row) => ({
        ...row,
        label: row.key,
        free_tier_new_users: row.free_tier_new_users ?? 0,
        paid_tier_new_users: row.paid_tier_new_users ?? 0,
      }));
  }, [monthly]);

  const schoolSubjectRows = useMemo(() => {
    const arr = schoolDetails?.subject_monthly_correct_pct;
    if (!arr || !Array.isArray(arr)) return [];
    return [...arr]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((row) => ({
        key: row.key,
        chinese: Number(row.chinese ?? 0),
        english: Number(row.english ?? 0),
        math: Number(row.math ?? 0),
      }));
  }, [schoolDetails]);

  const schoolGradeRows = useMemo(() => {
    const arr = schoolDetails?.registrations_by_grade_12m;
    if (!arr || !Array.isArray(arr)) return [];
    return [...arr]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((row) => ({
        key: row.key,
        P1: Number(row.P1 ?? 0),
        P2: Number(row.P2 ?? 0),
        P3: Number(row.P3 ?? 0),
        P4: Number(row.P4 ?? 0),
        P5: Number(row.P5 ?? 0),
        P6: Number(row.P6 ?? 0),
      }));
  }, [schoolDetails]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-gray-800">今日實時</h2>
          <button
            type="button"
            onClick={() => void loadToday()}
            disabled={tLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {tLoading ? "更新中…" : "重新整理"}
          </button>
        </div>
        {tErr && <p className="text-sm text-red-500">{tErr}</p>}
        {today && !tErr && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <p className="text-xs text-gray-500">HKT 日期：{String(today.hkt_date)}</p>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>
                今日曾完成練習的學生（人次不重複）：
                <span className="font-bold text-indigo-600 ml-1">{today.students_practice_distinct}</span>
              </li>
              <li>
                今日新註冊學生：
                <span className="font-bold text-indigo-600 ml-1">{today.new_students_today}</span>
              </li>
              <li>
                今日新增免費用戶：
                <span className="font-bold text-indigo-600 ml-1">
                  {today.free_tier_new_users_today ?? 0}
                </span>
              </li>
              <li>
                今日新增月費用戶：
                <span className="font-bold text-indigo-600 ml-1">
                  {today.paid_tier_new_users_today ?? 0}
                </span>
              </li>
            </ul>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-gray-700 mb-1">完成練習節數（依科目）</p>
                <table className="w-full border-collapse text-left">
                  <tbody>
                    {subjectEntries(today.sessions_by_subject).map(([sub, c]) => (
                      <tr key={sub} className="border-b border-gray-100">
                        <td className="py-1 pr-2">{sub}</td>
                        <td className="py-1 font-mono text-indigo-700">{c}</td>
                      </tr>
                    ))}
                    {subjectEntries(today.sessions_by_subject).length === 0 && (
                      <tr>
                        <td colSpan={2} className="text-gray-400 text-xs">暫無數據</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">完成題目數（依科目）</p>
                <table className="w-full border-collapse text-left">
                  <tbody>
                    {subjectEntries(today.questions_by_subject).map(([sub, c]) => (
                      <tr key={sub} className="border-b border-gray-100">
                        <td className="py-1 pr-2">{sub}</td>
                        <td className="py-1 font-mono text-indigo-700">{c}</td>
                      </tr>
                    ))}
                    {subjectEntries(today.questions_by_subject).length === 0 && (
                      <tr>
                        <td colSpan={2} className="text-gray-400 text-xs">暫無數據</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {!today && tLoading && (
          <p className="text-sm text-gray-500">載入中…</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-800">月結及趨勢（截至昨日）</h2>
        {mErr && <p className="text-sm text-red-500">{mErr}</p>}

        {monthly && !mErr && (
          <>
            <p className="text-xs text-gray-500">
              數據截至（香港）{String(monthly.through_hkt)} ；本月 MTD 指當曆年月至該截止日止。
            </p>

            <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="p-2 font-semibold">項目</th>
                    <th className="p-2 font-semibold">全庫 / 全期</th>
                    <th className="p-2 font-semibold">
                      本月 MTD
                      <span className="block text-xs font-normal text-gray-500">
                        {monthly.mt_year} 年 {monthly.mt_month} 月
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="p-2">學生註冊（累積人數 vs 本月新增）</td>
                    <td className="p-2 font-mono">{monthly.alltime_students}</td>
                    <td className="p-2 font-mono text-indigo-700">{monthly.mt_new_students}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-2">免費用戶新增（本月）</td>
                    <td className="p-2 text-gray-400">—</td>
                    <td className="p-2 font-mono text-indigo-700">
                      {monthly.mt_new_free_tier_users ?? 0}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-2">月費用戶新增（本月）</td>
                    <td className="p-2 text-gray-400">—</td>
                    <td className="p-2 font-mono text-indigo-700">
                      {monthly.mt_new_paid_tier_users ?? 0}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-2">家長帳戶（累積）</td>
                    <td className="p-2 font-mono">{monthly.alltime_parents}</td>
                    <td className="p-2 text-gray-400">—</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-2">曾完成之練習節數（有作答）</td>
                    <td className="p-2 font-mono">{monthly.alltime_practice_sessions}</td>
                    <td className="p-2 font-mono text-indigo-700">{monthly.mt_practice_sessions}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-2">作答筆數（session_answers）</td>
                    <td className="p-2 font-mono">{monthly.alltime_session_answers}</td>
                    <td className="p-2 font-mono text-indigo-700">{monthly.mt_session_answers}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-2">曾練習學生（人 • MTD 不重複）</td>
                    <td className="p-2 text-gray-400">—</td>
                    <td className="p-2 font-mono text-indigo-700">{monthly.mt_practice_students}</td>
                  </tr>
                  <tr>
                    <td className="p-2">家長儀表板瀏覽（次 • MTD）</td>
                    <td className="p-2 text-gray-400">—</td>
                    <td className="p-2 font-mono text-indigo-700">{monthly.mt_parent_views}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-sm font-bold text-gray-800">付費 / 免費用戶新增趨勢 — 最近 12 個曆月</h3>
            <div className="h-64 w-full" style={{ minWidth: 280 }}>
              {monthRows.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={monthRows}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(_, p) => {
                        const p0 = p?.[0] as { payload?: { label?: string } } | undefined;
                        return p0?.payload?.label ?? "";
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="free_tier_new_users"
                      name="免費用戶新增"
                      stroke="#14b8a6"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="paid_tier_new_users"
                      name="月費用戶新增"
                      stroke="#8b5cf6"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            <h3 className="text-sm font-bold text-gray-800">曾完成練習學生（人）— 最近 12 個曆月</h3>
            <div className="h-64 w-full" style={{ minWidth: 280 }}>
              {monthRows.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={monthRows}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(_, p) => {
                        const p0 = p?.[0] as { payload?: { label?: string } } | undefined;
                        return p0?.payload?.label ?? "";
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="practice_students"
                      name="人數"
                      stroke="#059669"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            <h3 className="text-sm font-bold text-gray-800">家長儀表板瀏覽（次）— 最近 12 個曆月</h3>
            <div className="h-64 w-full" style={{ minWidth: 280 }}>
              {monthRows.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={monthRows}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(_, p) => {
                        const p0 = p?.[0] as { payload?: { label?: string } } | undefined;
                        return p0?.payload?.label ?? "";
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="parent_views"
                      name="次數"
                      stroke="#d97706"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            <h3 className="text-sm font-bold text-gray-800">學生註冊（依性別 • 曆月）</h3>
            <div className="h-72 w-full" style={{ minWidth: 280 }}>
              {monthRows.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={monthRows}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(_, p) => {
                        const p0 = p?.[0] as { payload?: { label?: string } } | undefined;
                        return p0?.payload?.label ?? "";
                      }}
                    />
                    <Legend />
                    <Bar dataKey="male" name="男" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="female" name="女" stackId="a" fill="#ec4899" />
                    <Bar dataKey="undisclosed" name="未填" stackId="a" fill="#94a3b8" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
              <p className="text-sm font-semibold text-indigo-900">
                學校明細（按地區／學校查詢）
              </p>
              <p className="text-xs text-indigo-700">
                為避免查詢逾時，學校資料不會在頁面載入時自動計算。請先選擇地區，再按「查詢學校資料」。
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="block text-gray-700 mb-1">地區</span>
                  <select
                    value={selectedDistrict}
                    onChange={(e) => {
                      setSelectedDistrict(e.target.value);
                      setSelectedSchoolId("__all__");
                      setSchoolDetails(null);
                    }}
                    className="min-w-[180px] p-2 rounded-lg border border-gray-200 bg-white"
                  >
                    <option value="">請選擇地區</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block text-gray-700 mb-1">學校（可選）</span>
                  <select
                    value={selectedSchoolId}
                    onChange={(e) => setSelectedSchoolId(e.target.value)}
                    disabled={!selectedDistrict || schoolOptions.length === 0}
                    className="min-w-[220px] p-2 rounded-lg border border-gray-200 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="__all__">此地區全部學校</option>
                    {schoolOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => void loadSchoolDetails()}
                  disabled={sLoading || !selectedDistrict}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {sLoading ? "查詢中…" : "查詢學校資料"}
                </button>
              </div>
              {sErr && <p className="text-sm text-red-600">{sErr}</p>}
            </div>

            <h3 className="text-sm font-bold text-gray-800">學校明細圖表（按地區／學校）</h3>
            <p className="text-xs text-gray-500">
              以下 4 個圖表會按你已選擇的地區／學校條件即時更新；如未查詢則不顯示數據。
            </p>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  學校整體正確率 — 最近 12 個曆月 (Chinese)
                </h4>
                <div className="h-56 w-full" style={{ minWidth: 280 }}>
                  {schoolSubjectRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={schoolSubjectRows}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="key" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip formatter={(v) => [typeof v === "number" ? `${v}%` : "—", "中文正確率"]} />
                        <Line type="monotone" dataKey="chinese" name="Chinese" stroke="#2563eb" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-gray-500">
                      請先選擇地區／學校並查詢學校資料。
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  學校整體正確率 — 最近 12 個曆月 (English)
                </h4>
                <div className="h-56 w-full" style={{ minWidth: 280 }}>
                  {schoolSubjectRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={schoolSubjectRows}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="key" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip formatter={(v) => [typeof v === "number" ? `${v}%` : "—", "英文正確率"]} />
                        <Line type="monotone" dataKey="english" name="English" stroke="#7c3aed" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-gray-500">
                      請先選擇地區／學校並查詢學校資料。
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  學校整體正確率 — 最近 12 個曆月 (Math)
                </h4>
                <div className="h-56 w-full" style={{ minWidth: 280 }}>
                  {schoolSubjectRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={schoolSubjectRows}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="key" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip formatter={(v) => [typeof v === "number" ? `${v}%` : "—", "數學正確率"]} />
                        <Line type="monotone" dataKey="math" name="Math" stroke="#ea580c" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-gray-500">
                      請先選擇地區／學校並查詢學校資料。
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">
                  學生註冊 — 按年級（最近 12 個曆月）
                </h4>
                <div className="h-56 w-full" style={{ minWidth: 280 }}>
                  {schoolGradeRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={schoolGradeRows}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="key" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="P1" name="P1" stroke="#2563eb" dot={false} />
                        <Line type="monotone" dataKey="P2" name="P2" stroke="#14b8a6" dot={false} />
                        <Line type="monotone" dataKey="P3" name="P3" stroke="#8b5cf6" dot={false} />
                        <Line type="monotone" dataKey="P4" name="P4" stroke="#eab308" dot={false} />
                        <Line type="monotone" dataKey="P5" name="P5" stroke="#ef4444" dot={false} />
                        <Line type="monotone" dataKey="P6" name="P6" stroke="#334155" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-gray-500">
                      請先選擇地區／學校並查詢學校資料。
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {!monthly && mLoading && <p className="text-sm text-gray-500">載入中…</p>}
      </section>
    </div>
  );
}
