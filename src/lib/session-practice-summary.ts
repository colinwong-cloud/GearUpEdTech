import {
  computeTypeStats,
  rate,
  TARGET_LO,
  TARGET_HI,
  TARGET_PARENT_HI,
  TREND_GAP_PCT,
  tipForParentWeak,
  type AnswerLike,
} from "./session-practice-summary-core";

export type { AnswerLike } from "./session-practice-summary-core";
export { computeTypeStats, rate, tipForParentWeak, TREND_GAP_PCT } from "./session-practice-summary-core";

export type PriorSessionScore = {
  id?: string;
  score: number;
  questions_attempted: number;
  correct_pct?: number;
  created_at?: string;
};

export type PracticeComparisonMode = "first" | "last_one" | "last_ten";
export type PracticeTrend = "up" | "similar" | "down";

export type PracticeComparison = {
  /** false when history could not be loaded; do not claim "first practice". */
  historyKnown: boolean;
  priorCount: number;
  mode: PracticeComparisonMode;
  currentPct: number;
  baselinePct: number | null;
  trend: PracticeTrend | null;
};

export function sessionPercent(session: PriorSessionScore): number {
  if (typeof session.correct_pct === "number" && Number.isFinite(session.correct_pct)) {
    return Math.round(session.correct_pct);
  }
  if (session.questions_attempted > 0) {
    return Math.round((session.score / session.questions_attempted) * 100);
  }
  return 0;
}

export function currentAnswersPercent(answers: AnswerLike[]): number {
  if (answers.length === 0) return 0;
  return Math.round((answers.filter((a) => a.isCorrect).length / answers.length) * 100);
}

/**
 * priorSessionsNewestFirst must already exclude the current session.
 * 0 prior → first; 1–9 → vs last one; 10+ → vs last-10 session average.
 */
export function buildPracticeComparison(
  currentPct: number,
  priorSessionsNewestFirst: PriorSessionScore[],
  options?: { historyKnown?: boolean }
): PracticeComparison {
  const current = Math.round(currentPct);
  const historyKnown = options?.historyKnown !== false;
  const prior = priorSessionsNewestFirst.filter((s) => s.questions_attempted > 0);
  if (!historyKnown) {
    return {
      historyKnown: false,
      priorCount: 0,
      mode: "first",
      currentPct: current,
      baselinePct: null,
      trend: null,
    };
  }
  if (prior.length === 0) {
    return {
      historyKnown: true,
      priorCount: 0,
      mode: "first",
      currentPct: current,
      baselinePct: null,
      trend: null,
    };
  }

  const mode: PracticeComparisonMode = prior.length >= 10 ? "last_ten" : "last_one";
  let baselinePct: number;
  if (mode === "last_one") {
    baselinePct = sessionPercent(prior[0]);
  } else {
    const lastTen = prior.slice(0, 10);
    baselinePct = Math.round(
      lastTen.reduce((sum, session) => sum + sessionPercent(session), 0) / lastTen.length
    );
  }
  const delta = current - baselinePct;
  const trend: PracticeTrend =
    delta >= TREND_GAP_PCT ? "up" : delta <= -TREND_GAP_PCT ? "down" : "similar";
  return {
    historyKnown: true,
    priorCount: prior.length,
    mode,
    currentPct: current,
    baselinePct,
    trend,
  };
}

function studentTrendLine(comparison: PracticeComparison): string {
  const { currentPct: c } = comparison;
  if (comparison.mode === "first") {
    if (comparison.historyKnown) {
      return `第一次完成練習，做得好！今次 ${c}%。`;
    }
    return "";
  }
  const b = comparison.baselinePct ?? 0;
  const trend = comparison.trend || "similar";
  if (comparison.mode === "last_one") {
    if (trend === "up") return `今次 ${c}%，比上次 ${b}% 進步喇！`;
    if (trend === "down") return `今次 ${c}%，比上次 ${b}% 低少少都唔緊要。`;
    return `今次 ${c}%，同上次 ${b}% 差唔多，穩陣！`;
  }
  if (trend === "up") return `今次 ${c}%，比近10次平均 ${b}% 進步喇！`;
  if (trend === "down") return `今次 ${c}%，比近10次平均 ${b}% 低少少都唔緊要。`;
  return `今次 ${c}%，同近10次平均 ${b}% 差唔多，穩陣！`;
}

function parentTrendLine(name: string, comparison: PracticeComparison): string {
  const { currentPct: c } = comparison;
  if (comparison.mode === "first") {
    if (comparison.historyKnown) {
      return `關於${name}今節練習（第一次完成），正確率 ${c}%。`;
    }
    return `關於${name}今節練習，正確率 ${c}%。`;
  }
  const b = comparison.baselinePct ?? 0;
  const trend = comparison.trend || "similar";
  const verb = trend === "up" ? "上升" : trend === "down" ? "稍為回落" : "相若";
  if (comparison.mode === "last_one") {
    return `關於${name}今節練習，正確率 ${c}%，較上節 ${b}% ${verb}。`;
  }
  return `關於${name}今節練習，正確率 ${c}%，較近10次平均 ${b}% ${verb}。`;
}

function finishSummary(text: string, lo: number, hi: number): string {
  let s = text.replace(/[ \t]+/g, "").trim();
  if (s.length > hi) {
    const lastPeriod = s.lastIndexOf("。", hi);
    if (lastPeriod >= lo - 8) s = s.slice(0, lastPeriod + 1);
    else s = s.slice(0, hi);
  }
  if (s.length < lo) s = (s + "繼續加油。").slice(0, hi);
  return s;
}

function topicBits(answers: AnswerLike[]): { strongName: string; weakName: string; overallR: number } {
  const list = computeTypeStats(answers);
  list.sort((a, b) => rate(b) - rate(a));
  const best = list[0];
  const worst = [...list].sort((a, b) => rate(a) - rate(b))[0];
  const overallR = answers.filter((a) => a.isCorrect).length / answers.length;
  const strongName = best && best.total ? best.type : "整體";
  const weakName = worst && worst.total > 0 && rate(worst) < 0.6 ? worst.type : "";
  return { strongName, weakName, overallR };
}

/**
 * 學生結果頁：直接對學生說話，繁體、鼓勵；有歷史時加入今次 vs 上次／近10次比較。
 */
export function buildSessionPracticeSummary(
  answers: AnswerLike[],
  _subjectKey: string,
  comparison?: PracticeComparison
): string {
  void _subjectKey;
  if (answers.length === 0) {
    return "今次沒有作答，下次再一齊加油，小步也會是進步！";
  }

  const { strongName, weakName, overallR } = topicBits(answers);
  const cmp =
    comparison ??
    buildPracticeComparison(currentAnswersPercent(answers), [], { historyKnown: false });
  const trendLine = studentTrendLine(cmp);

  let s = trendLine;
  if (!s) {
    if (overallR >= 0.8) s = `叻呀！今次 ${cmp.currentPct}%，在「${strongName}」特別有把握。`;
    else if (overallR >= 0.55) s = `做得好！今次 ${cmp.currentPct}%，在「${strongName}」有唔錯的基礎。`;
    else s = `唔使灰心，學習有上有落好正常。今次 ${cmp.currentPct}%，你喺「${strongName}」都仲有可以發揮的位。`;
  } else if (strongName) {
    s += `你喺「${strongName}」${overallR >= 0.55 ? "有把握" : "都仲有可以發揮的位"}。`;
  }

  if (weakName && weakName !== strongName) {
    s += `要留意「${weakName}」可以多練少少。`;
  }

  s += "下次再一齊加油！";
  return finishSummary(s, TARGET_LO, TARGET_HI);
}

/**
 * 家長電郵：老師視角、對家長說話；比較事實與學生小結一致。
 */
export function buildSessionPracticeSummaryForParent(
  answers: AnswerLike[],
  _subjectKey: string,
  studentName: string,
  comparison?: PracticeComparison
): string {
  void _subjectKey;
  const name = studentName.trim() || "同學";
  if (answers.length === 0) {
    return `敬啟者：${name}今節未有作答紀錄，建議下次預留完整時間完成，以便檢視學習狀況。`;
  }

  const { strongName, weakName } = topicBits(answers);
  const cmp =
    comparison ??
    buildPracticeComparison(currentAnswersPercent(answers), [], { historyKnown: false });

  let s = parentTrendLine(name, cmp);
  s += `「${strongName}」掌握較穩。`;
  if (weakName && weakName !== strongName) {
    s += `較需留意「${weakName}」。${tipForParentWeak(weakName)}`;
  } else {
    s += "建議維持規律練習，並留意審題習慣。";
  }
  s += "如有疑問歡迎回覆與我們聯絡，謝謝。";
  return finishSummary(s, TARGET_LO, TARGET_PARENT_HI);
}

export function charLenZh(s: string): number {
  return s.length;
}

export function priorSessionsFromChart(
  sessions: PriorSessionScore[] | null | undefined,
  currentSessionId?: string | null
): PriorSessionScore[] {
  return (sessions ?? [])
    .filter((s) => s.questions_attempted > 0 && (!currentSessionId || s.id !== currentSessionId))
    .slice()
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
}
