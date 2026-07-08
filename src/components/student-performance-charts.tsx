"use client";

import dynamic from "next/dynamic";

const BarChart = dynamic(() => import("recharts").then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((m) => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const ReferenceLine = dynamic(() => import("recharts").then((m) => m.ReferenceLine), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const Cell = dynamic(() => import("recharts").then((m) => m.Cell), { ssr: false });

export interface ChartSession {
  id: string;
  created_at: string;
  questions_attempted: number;
  score: number;
  correct_pct: number;
}

export interface ChartTypeSession {
  question_type: string;
  session_id: string;
  created_at: string;
  total: number;
  correct: number;
  correct_pct: number;
}

export interface GradeAverage {
  question_type: string;
  avg_correct_pct: number;
  total_sessions: number;
}

export interface ChartDataPayload {
  grade_level: string;
  sessions: ChartSession[];
  type_sessions: ChartTypeSession[];
  grade_averages: GradeAverage[];
}

export function pctColor(pct: number): string {
  if (pct >= 80) return "#059669";
  if (pct >= 60) return "#d97706";
  return "#dc2626";
}

export function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { datetime: string; pct: number } }> }) {
  if (!active || !payload || !payload[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 text-xs">
      <p className="text-gray-500">{d.datetime}</p>
      <p className="font-bold" style={{ color: pctColor(d.pct) }}>{d.pct}%</p>
    </div>
  );
}

export function OverallChart({ chartData }: { chartData: ChartDataPayload }) {
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

export function TypeCharts({ chartData }: { chartData: ChartDataPayload }) {
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
