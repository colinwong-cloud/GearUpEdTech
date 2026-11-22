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

/** Soft #263 — per-question star row marker (progress display only). */
export type PracticeProgressMarkerVisual =
  | "unvisited-dot"
  | "answered-star"
  | "skipped-grey-star"
  | "current-answered-star"
  | "current-unanswered-star"
  | "current-skipped-grey-star";

export function questionHasSessionAnswer(
  choicesByIndex: Record<number, string | undefined>,
  questionIndex: number
): boolean {
  const v = choicesByIndex[questionIndex];
  return v != null && String(v).trim().length > 0;
}

export function createInitialPracticeVisitState(): Record<number, boolean> {
  return { 0: true };
}

/** Mark skip on leave-without-answer; mark next index visited. */
export function onPracticeNavigateAway(
  currentIndex: number,
  nextIndex: number,
  choicesByIndex: Record<number, string | undefined>,
  visited: Record<number, boolean>,
  skipped: Record<number, boolean>
): { visited: Record<number, boolean>; skipped: Record<number, boolean> } {
  const hasAnswer = questionHasSessionAnswer(choicesByIndex, currentIndex);
  let nextSkipped = { ...skipped };
  if (!hasAnswer) {
    nextSkipped[currentIndex] = true;
  } else if (currentIndex in nextSkipped) {
    nextSkipped = { ...nextSkipped };
    delete nextSkipped[currentIndex];
  }
  return {
    visited: { ...visited, [currentIndex]: true, [nextIndex]: true },
    skipped: nextSkipped,
  };
}

export function clearPracticeSkippedForIndex(
  skipped: Record<number, boolean>,
  questionIndex: number
): Record<number, boolean> {
  if (!(questionIndex in skipped)) return skipped;
  const next = { ...skipped };
  delete next[questionIndex];
  return next;
}

export function buildQuestionProgressMarkers(
  totalQuestions: number,
  currentIndex: number,
  visited: Record<number, boolean>,
  skipped: Record<number, boolean>,
  choicesByIndex: Record<number, string | undefined>
): PracticeProgressMarkerVisual[] {
  const markers: PracticeProgressMarkerVisual[] = [];
  const safeTotal = Math.max(0, Math.trunc(totalQuestions));
  const safeCurrent = Math.min(
    Math.max(0, Math.trunc(currentIndex)),
    Math.max(safeTotal - 1, 0)
  );
  for (let i = 0; i < safeTotal; i++) {
    const isCurrent = i === safeCurrent;
    const hasAnswer = questionHasSessionAnswer(choicesByIndex, i);
    const isVisited = Boolean(visited[i]);
    const isSkipped = Boolean(skipped[i]) && !hasAnswer;

    if (isCurrent) {
      if (hasAnswer) markers.push("current-answered-star");
      else if (isSkipped) markers.push("current-skipped-grey-star");
      else markers.push("current-unanswered-star");
    } else if (hasAnswer) {
      markers.push("answered-star");
    } else if (isSkipped || (isVisited && !hasAnswer)) {
      markers.push("skipped-grey-star");
    } else {
      markers.push("unvisited-dot");
    }
  }
  return markers;
}