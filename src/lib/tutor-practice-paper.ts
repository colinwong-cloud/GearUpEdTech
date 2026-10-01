import {
  CHINESE_QUIZ_SUBJECT,
  ENGLISH_QUIZ_SUBJECT,
  PRIMARY_QUIZ_SUBJECT,
  type QuizSubjectKey,
} from "@/lib/quiz-subjects";

export const PRACTICE_PAPER_QUESTION_COUNT = 30;
export const FREE_PRACTICE_PAPER_MONTHLY_LIMIT = 4;
export const PRACTICE_PAPER_OVERVIEW_DAYS = 180;

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

/** Start of the overview window: papers older than this are left off the list. */
export function practicePaperOverviewSince(date = new Date()): Date {
  return new Date(date.getTime() - PRACTICE_PAPER_OVERVIEW_DAYS * 24 * 60 * 60 * 1000);
}

export function hktMonthLabel(monthKey: string): string {
  const [yearText, monthText] = monthKey.split("-");
  const month = Number(monthText);
  if (!yearText || !Number.isFinite(month)) return monthKey;
  return `${yearText}年${month}月`;
}

export function hktDateLabel(date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function hktStampPart(date: Date, type: Intl.DateTimeFormatPartTypes): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return parts.find((part) => part.type === type)?.value ?? "";
}

/** `YYYYMMDD-HHmmss` in Hong Kong time, safe to put in a file name. */
export function practicePaperFileStamp(date: Date): string {
  const year = hktStampPart(date, "year");
  const month = hktStampPart(date, "month");
  const day = hktStampPart(date, "day");
  const hour = hktStampPart(date, "hour");
  const minute = hktStampPart(date, "minute");
  const second = hktStampPart(date, "second");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/** Last four digits of the registered mobile, so two students are not saved as the same file. */
export function practicePaperMobileSuffix(mobile: string): string {
  const digits = String(mobile ?? "").replace(/\D/g, "");
  if (digits.length === 0) return "0000";
  return digits.slice(-4).padStart(4, "0");
}

function safeDownloadSegment(value: string, fallback: string): string {
  const cleaned = String(value ?? "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "")
    .trim();
  return cleaned || fallback;
}

export function practicePaperDownloadFilename(input: {
  subjectLabel: string;
  studentName: string;
  mobile: string;
  kind: "student" | "answer";
  createdAt: Date;
}): { ascii: string; unicode: string } {
  const stamp = practicePaperFileStamp(input.createdAt);
  const tail = practicePaperMobileSuffix(input.mobile);
  const kindAscii = input.kind === "answer" ? "answer" : "student";
  const kindLabel = input.kind === "answer" ? "答案卷" : "學生卷";
  const subject = safeDownloadSegment(input.subjectLabel, "科目");
  const student = safeDownloadSegment(input.studentName, "學生");
  return {
    ascii: `gearup-${tail}-${stamp}-${kindAscii}.pdf`,
    unicode: `GearUp-${subject}-${student}-${tail}-${stamp}-${kindLabel}.pdf`,
  };
}

export function filenameFromContentDisposition(header: string | null, fallback: string): string {
  const value = String(header ?? "");
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // Fall through to the plain filename.
    }
  }
  const plain = /filename="([^"]+)"/i.exec(value);
  return plain?.[1] || fallback;
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
