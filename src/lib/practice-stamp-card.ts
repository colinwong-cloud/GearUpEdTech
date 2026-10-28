/** Practice stamp card — Phase 1 earn + streak rules (mirrors SQL RPC). */

export const PRACTICE_STAMP_MIN_ANSWERS = 10;

export type PracticeStampAwardReason =
  | "insufficient_answers"
  | "already_stamped_today"
  | "enrolment_closed"
  | "session_not_found";

export type PracticeStampAwardEvaluation = {
  awarded: boolean;
  reason?: PracticeStampAwardReason;
  newStreak?: number;
  enrolsNewCard?: boolean;
};

export function isExcludedTestMobileForKpi(mobile: string | null | undefined): boolean {
  if (!mobile) return false;
  return mobile.startsWith("9999");
}

export function getHktCalendarDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Previous HKT calendar day as YYYY-MM-DD. */
export function previousHktCalendarDate(hktDate: string): string {
  const [y, m, d] = hktDate.split("-").map(Number);
  const utcMs = Date.UTC(y, m - 1, d, 12, 0, 0) - 8 * 60 * 60 * 1000;
  const prev = new Date(utcMs - 24 * 60 * 60 * 1000);
  return getHktCalendarDate(prev);
}

/**
 * Streak shown in UI: 0 if the student did not stamp yesterday or today (gap breaks streak).
 */
export function effectivePracticeStampStreak(
  lastStampHktDate: string | null,
  todayHkt: string,
  storedStreak: number
): number {
  if (!lastStampHktDate) return 0;
  const yesterday = previousHktCalendarDate(todayHkt);
  if (lastStampHktDate === todayHkt || lastStampHktDate === yesterday) {
    return Math.max(0, storedStreak);
  }
  return 0;
}

/**
 * After a successful award on `awardHktDate`, compute the new consecutive-day streak.
 */
export function computePracticeStampStreakAfterAward(
  lastStampHktDate: string | null,
  storedStreak: number,
  awardHktDate: string
): number {
  if (!lastStampHktDate) return 1;
  const yesterday = previousHktCalendarDate(awardHktDate);
  if (lastStampHktDate === awardHktDate) {
    return storedStreak;
  }
  if (lastStampHktDate === yesterday) {
    return Math.max(1, storedStreak + 1);
  }
  return 1;
}

export function evaluatePracticeStampAward(input: {
  answeredCount: number;
  programOpen: boolean;
  hasActiveCard: boolean;
  alreadyStampedToday: boolean;
  lastStampHktDate: string | null;
  storedStreak: number;
  awardHktDate: string;
}): PracticeStampAwardEvaluation {
  if (input.answeredCount < PRACTICE_STAMP_MIN_ANSWERS) {
    return { awarded: false, reason: "insufficient_answers" };
  }
  if (input.alreadyStampedToday) {
    return { awarded: false, reason: "already_stamped_today" };
  }
  if (!input.hasActiveCard && !input.programOpen) {
    return { awarded: false, reason: "enrolment_closed" };
  }
  const enrolsNewCard = !input.hasActiveCard;
  const newStreak = computePracticeStampStreakAfterAward(
    input.lastStampHktDate,
    input.storedStreak,
    input.awardHktDate
  );
  return { awarded: true, newStreak, enrolsNewCard };
}
