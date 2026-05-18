import { subjectDisplayLabel } from "./quiz-subjects";

export const AI_QUESTION_SOURCE = "AI";

export function normalizeQuestionSource(source: string | null | undefined): string {
  return (source || "").trim().toUpperCase();
}

export function isAiQuestionSource(source: string | null | undefined): boolean {
  return normalizeQuestionSource(source) === AI_QUESTION_SOURCE;
}

export function buildStrictAiQuestionPoolErrorMessage({
  subjectKey,
  gradeLevel,
  requestedCount,
  availableCount,
}: {
  subjectKey: string;
  gradeLevel: string;
  requestedCount: number;
  availableCount: number;
}): string {
  const subjectLabel = subjectDisplayLabel(subjectKey);
  return `AI 題庫不足：${subjectLabel}（${gradeLevel}）目前只有 ${availableCount} 題（需要 ${requestedCount} 題），請選擇較少題數或稍後再試。`;
}
