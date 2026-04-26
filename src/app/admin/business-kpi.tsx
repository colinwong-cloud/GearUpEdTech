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
  mt_practice_students: number;
  mt_parent_views: number;
  alltime_students: number;
  alltime_parents: number;
  alltime_practice_sessions: number;
  alltime_session_answers: number;
  trend_12m: TrendPoint[];
  schools_students_by_grade: SchoolByGrade[];
  school_monthly_correct_pct: { key: string; by_school_id: Record<string, number> }[];
};

const GRADES = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;

function subjectEntries(obj: Record<string, number> | null | undefined) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
}

export function BusinessKpiSection({ user, pass }: { user: string; pass: string }) {
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPayload | null>(null);
  const [tLoading, setTLoading] = useState(true);
  const [mLoading, setMLoading] = useState(true);
  const [tErr, setTErr] = useState("");
  const [mErr, setMErr] = useState("");

  const [schoolRegDistrict, setSchoolRegDistrict] = useState<string>("__all__");
  const [schoolRegOpen, setSchoolRegOpen] = useState(false);
  const [rateDistrict, setRateDistrict] = useState<string>("__all__");
  const [rateOpen, setRateOpen] = useState(false);

  const loadToday = useCallback(async () => {
    setTLoading(true);
    setTErr("");
    try {
      const res = await fetch("/api/admin/business-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, pass }),
      });
      const j = (await res.json()) as { data?: TodayPayload; error?: string };
      if (!res.ok) throw new Error(j.error || "無法載入");
      setToday((j.data as TodayPayload) ?? null);
    } catch (e) {
      setTErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setTLoading(false);
    }
  }, [user, pass]);

  const loadMonthly = useCallback(async () => {
    setMLoading(true);
    setMErr("");
    try {
      const res = await fetch("/api/admin/business-monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, pass }),
      });
      const j = (await res.json()) as { data?: MonthlyPayload; error?: string };
      if (!res.ok) throw new Error(j.error || "無法載入");
      setMonthly((j.data as MonthlyPayload) ?? null);
    } catch (e) {
      setMErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setMLoading(false);
    }
  }, [user, pass]);

  useEffect(() => {
    void loadToday();
    void loadMonthly();
  }, [loadToday, loadMonthly]);

  const districts = useMemo(() => {
    const s = monthly?.schools_students_by_grade;
    if (!s || !Array.isArray(s)) return [] as string[];
    const d = new Set(s.map((x) => x.district).filter(Boolean));
    return [...d].sort((a, b) => a.localeCompare(b, "zh-HK"));
  }, [monthly]);

  const schoolsForReg = useMemo(() => {
    const s = monthly?.schools_students_by_grade;
    if (!s || !Array.isArray(s)) return [];
    if (schoolRegDistrict === "__all__") return s;
    return s.filter((x) => x.district === schoolRegDistrict);
  }, [monthly, schoolRegDistrict]);

  const schoolsForRate = useMemo(() => {
    const s = monthly?.schools_students_by_grade;
    if (!s || !Array.isArray(s)) return [];
    if (rateDistrict === "__all__") return s;
    return s.filter((x) => x.district === rateDistrict);
  }, [monthly, rateDistrict]);

  const monthRows = useMemo(() => {
    const t = monthly?.trend_12m;
    if (!t || !Array.isArray(t)) return [];
    return [...t]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((row) => ({
        ...row,
        label: row.key,
      }));
  }, [monthly]);

  const schoolRateLineData = useMemo(() => {
    const arr = monthly?.school_monthly_correct_pct;
    const schools = schoolsForRate;
    if (!arr || !Array.isArray(arr) || schools.length === 0) return [];
    const idSet = new Set(schools.map((s) => s.id));
    return [...arr]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((bucket) => {
        let sum = 0;
        let n = 0;
        for (const sid of idSet) {
          const v = bucket.by_school_id?.[sid];
          if (v != null && !Number.isNaN(Number(v))) {
            sum += Number(v);
            n += 1;
          }
        }
        const avg = n > 0 ? Math.round((sum / n) * 100) / 100 : 0;
        return { monthLabel: bucket.key, avg };
      });
  }, [monthly, schoolsForRate]);

  const latestRateBySchool = useMemo(() => {
    const arr = monthly?.school_monthly_correct_pct;
    if (!arr || arr.length === 0) return new Map<string, number>();
    const latest = [...arr].sort((a, b) => a.key.localeCompare(b.key)).at(-1) as
      | { by_school_id?: Record<string, number> }
      | undefined;
    const m = new Map<string, number>();
    if (latest?.by_school_id) {
      for (const [k, v] of Object.entries(latest.by_school_id)) {
        m.set(k, Number(v));
      }
    }
    return m;
  }, [monthly]);

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
                    <td className="p-2">家長帳戶（累積）</td>
                    <td className="p-2 font-mono">{monthly.alltime_parents}</td>
                    <td className="p-2 text-gray-400">—</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-2">曾完成之練習節數（有作答）</td>
                    <td className="p-2 font-mono">{monthly.alltime_practice_sessions}</td>
                    <td className="p-2 text-gray-400">—</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-2">作答筆數（session_answers）</td>
                    <td className="p-2 font-mono">{monthly.alltime_session_answers}</td>
                    <td className="p-2 text-gray-400">—</td>
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

            <h3 className="text-sm font-bold text-gray-800 pt-2">學生註冊 — 最近 12 個曆月</h3>
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
                    <Bar dataKey="registrations" name="新註冊" fill="#4f46e5" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setSchoolRegOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold bg-gray-50 hover:bg-gray-100"
              >
                <span>學生註冊 — 按學校及年級</span>
                <span className="text-gray-500">{schoolRegOpen ? "−" : "+"}</span>
              </button>
              {schoolRegOpen && (
                <div className="p-4 space-y-3 bg-white">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-600">地區</span>
                    <select
                      value={schoolRegDistrict}
                      onChange={(e) => setSchoolRegDistrict(e.target.value)}
                      className="p-2 rounded-lg border border-gray-200 bg-white"
                    >
                      <option value="__all__">全港</option>
                      {districts.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm border-collapse min-w-[520px]">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="text-left p-2">學校</th>
                          {GRADES.map((g) => (
                            <th key={g} className="p-1 text-center font-mono text-xs w-10">
                              {g}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {schoolsForReg.map((row) => (
                          <tr key={row.id} className="border-b border-gray-100">
                            <td className="p-2 align-top">
                              <span className="font-medium">{row.name}</span>
                              <span className="block text-xs text-gray-400">{row.district}</span>
                            </td>
                            {GRADES.map((g) => (
                              <td key={g} className="p-1 text-center font-mono text-xs">
                                {row.by_grade?.[g] != null && row.by_grade[g]! > 0
                                  ? row.by_grade[g]
                                  : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
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

            <h3 className="text-sm font-bold text-gray-800">學校整體正確率 — 最近 12 個曆月</h3>
            <p className="text-xs text-gray-500">
              圖表為所選地區內各校正確率之算術平均；表格為最近一欄曆月（截至昨日）各校百分比。
            </p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-3 bg-white space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-600">地區</span>
                  <select
                    value={rateDistrict}
                    onChange={(e) => setRateDistrict(e.target.value)}
                    className="p-2 rounded-lg border border-gray-200 bg-white"
                  >
                    <option value="__all__">全港</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="h-56 w-full" style={{ minWidth: 280 }}>
                  {schoolRateLineData.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={schoolRateLineData}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="monthLabel"
                          tick={{ fontSize: 9 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          labelFormatter={(_, p) => {
                            const p0 = p?.[0] as { payload?: { monthLabel?: string } } | undefined;
                            return p0?.payload?.monthLabel ?? "";
                          }}
                          formatter={(v) => [
                            typeof v === "number" ? `${v}%` : "—",
                            "平均正確率",
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="avg"
                          name="地區內學校平均正確率"
                          stroke="#7c3aed"
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRateOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold bg-gray-50 hover:bg-gray-100 border-t border-gray-200"
              >
                <span>學校列表及正確率</span>
                <span className="text-gray-500">{rateOpen ? "−" : "+"}</span>
              </button>
              {rateOpen && (
                <div className="p-4 max-h-96 overflow-y-auto bg-white border-t border-gray-100">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-1 pr-2">學校</th>
                        <th className="py-1 pr-2">年級人數分佈</th>
                        <th className="py-1">正確率（%）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schoolsForRate.map((s) => (
                        <tr key={s.id} className="border-b border-gray-100">
                          <td className="py-1 pr-2 align-top">
                            {s.name}
                            <span className="block text-xs text-gray-400">{s.district}</span>
                          </td>
                          <td className="py-1 pr-2 text-xs text-gray-600">
                            {GRADES.map((g) => {
                              const c = s.by_grade?.[g] ?? 0;
                              if (!c) return null;
                              return (
                                <span key={g} className="inline-block mr-1">
                                  {g}:{c}
                                </span>
                              );
                            })}
                          </td>
                          <td className="py-1 font-mono text-indigo-800">
                            {latestRateBySchool.get(s.id) != null
                              ? `${latestRateBySchool.get(s.id)}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!monthly && mLoading && <p className="text-sm text-gray-500">載入中…</p>}
      </section>
    </div>
  );
}
