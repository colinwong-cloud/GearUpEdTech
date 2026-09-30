import {
  CHINESE_QUIZ_SUBJECT,
  ENGLISH_QUIZ_SUBJECT,
  PRIMARY_QUIZ_SUBJECT,
  type QuizSubjectKey,
} from "@/lib/quiz-subjects";

export const PRACTICE_PAPER_QUESTION_COUNT = 30;
export const FREE_PRACTICE_PAPER_MONTHLY_LIMIT = 4;

const GRADE_LABELS: Record<string, string> = {
  P1: "小一",
  P2: "小二",
  P3: "小三",
  P4: "小四",
  P5: "小五",
  P6: "小六",
};

export type PracticePaperQuestion = {
  id: string;
  content: string;
  opt_a: string | null;
  opt_b: string | null;
  opt_c: string | null;
  opt_d: string | null;
  correct_answer: string;
  explanation: string | null;
  image_url: string | null;
};

export function isPracticePaperSubject(value: string): value is QuizSubjectKey {
  return (
    value === PRIMARY_QUIZ_SUBJECT ||
    value === CHINESE_QUIZ_SUBJECT ||
    value === ENGLISH_QUIZ_SUBJECT
  );
}

export function hktMonthKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
  }).format(date);
  return parts.slice(0, 7);
}

export function hktDateLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function gradeDisplayLabel(gradeLevel: string): string {
  const key = gradeLevel.trim().toUpperCase();
  return GRADE_LABELS[key] ?? gradeLevel.trim();
}

export function remainingPracticePapers(
  used: number,
  limit = FREE_PRACTICE_PAPER_MONTHLY_LIMIT
): number {
  if (!Number.isFinite(used) || used < 0) return limit;
  return Math.max(0, limit - used);
}

export function practicePaperQuotaError(
  used: number,
  limit = FREE_PRACTICE_PAPER_MONTHLY_LIMIT
): string | null {
  if (used >= limit) {
    return `本月已生成 ${limit} 份練習卷，下月可再生成。`;
  }
  return null;
}

export function pickPracticeQuestions<T>(pool: T[], count: number, random: () => number): T[] | null {
  if (pool.length < count) return null;
  const copy = [...pool];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swap];
    copy[swap] = current;
  }
  return copy.slice(0, count);
}

export function practicePaperChoiceLines(question: PracticePaperQuestion): string[] {
  const rows: Array<[string, string | null]> = [
    ["A", question.opt_a],
    ["B", question.opt_b],
    ["C", question.opt_c],
    ["D", question.opt_d],
  ];
  return rows
    .filter(([, value]) => Boolean(value && value.trim()))
    .map(([key, value]) => `${key}. ${value?.trim() ?? ""}`);
}
