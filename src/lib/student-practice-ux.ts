/** Soft #260 — student regular 練習 session UX helpers (pure logic for tests). */

export const PRACTICE_FINISH_DISABLED_REASON = "尚有題目未作答";

export const PRACTICE_NAV_PREV_LABEL = "上一題";
export const PRACTICE_NAV_NEXT_LABEL = "下一題";
export const PRACTICE_NAV_FINISH_LABEL = "完成";

export function summarizeCollapsedQuestionTypes(
  totalTypes: number,
  enabledCount: number
): string {
  if (totalTypes <= 0) return "";
  if (enabledCount >= totalTypes) return "全部";
  return `已選 ${enabledCount} 種`;
}

export function countSessionAnswers(
  choicesByIndex: Record<number, string | undefined>,
  totalQuestions: number
): number {
  let n = 0;
  for (let i = 0; i < totalQuestions; i++) {
    const v = choicesByIndex[i];
    if (v != null && String(v).trim().length > 0) n++;
  }
  return n;
}

export function everyQuestionAnswered(
  choicesByIndex: Record<number, string | undefined>,
  totalQuestions: number
): boolean {
  if (totalQuestions <= 0) return false;
  return countSessionAnswers(choicesByIndex, totalQuestions) === totalQuestions;
}

export function canUsePracticePrev(currentIndex: number): boolean {
  return currentIndex > 0;
}

export function canUsePracticeNext(
  currentIndex: number,
  totalQuestions: number
): boolean {
  return currentIndex < totalQuestions - 1;
}

export function showPracticeFinishButton(
  currentIndex: number,
  totalQuestions: number
): boolean {
  return totalQuestions > 0 && currentIndex === totalQuestions - 1;
}

export function practiceFinishEnabled(
  choicesByIndex: Record<number, string | undefined>,
  totalQuestions: number
): boolean {
  return everyQuestionAnswered(choicesByIndex, totalQuestions);
}