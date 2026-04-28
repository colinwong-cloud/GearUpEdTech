import type { Question } from "@/lib/types";

export interface AnswerLike {
  question: Question;
  isCorrect: boolean;
}

export type TypeStats = { type: string; total: number; correct: number };

export const TARGET_LO = 50;
export const TARGET_HI = 80;

export function computeTypeStats(answers: AnswerLike[]): TypeStats[] {
  const byType: Record<string, TypeStats> = {};
  for (const a of answers) {
    const t = (a.question.question_type || "綜合").trim() || "綜合";
    if (!byType[t]) byType[t] = { type: t, total: 0, correct: 0 };
    byType[t].total++;
    if (a.isCorrect) byType[t].correct++;
  }
  return Object.values(byType);
}

export const rate = (s: TypeStats) => (s.total > 0 ? s.correct / s.total : 0);

export function tipForParentWeak(typeLabel: string): string {
  if (!typeLabel) return "可安排每天五至十分鐘短練，循序漸進。";
  if (/應用|文字|讀解/.test(typeLabel))
    return "日常購物找零、陪讀圖書時多問「題目要我們找甚麼」，有助理解題意。";
  if (/圖形|空間|面積|周界/.test(typeLabel))
    return "散步時可請孩子指認招牌、窗框的形狀，把形狀與生活連起來。";
  if (/分數|小數|百/.test(typeLabel))
    return "超市價牌、折扣標示都是現成小題目，有空可一起口頭算算。";
  if (/計算|四則/.test(typeLabel))
    return "煮食分量、分零食時順便練加減乘除，輕鬆又貼近生活。";
  return "鼓勵孩子讀題時圈出關鍵字，家長旁聽不必急於給答案。";
}
