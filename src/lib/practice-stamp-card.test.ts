import { describe, it, expect } from "vitest";
import {
  PRACTICE_STAMP_CARD_SIZE,
  PRACTICE_STAMP_MIN_ANSWERS,
  computePracticeStampStreakAfterAward,
  effectivePracticeStampStreak,
  evaluatePracticeStampAward,
  getHktCalendarDate,
  isExcludedTestMobileForKpi,
  previousHktCalendarDate,
} from "./practice-stamp-card";

describe("practice stamp card earn rules", () => {
  it("uses twenty stamps per card for redeem (4×5 grid)", () => {
    expect(PRACTICE_STAMP_CARD_SIZE).toBe(20);
  });

  const awardDate = "2026-10-28";

  it("requires at least ten answered questions", () => {
    const result = evaluatePracticeStampAward({
      answeredCount: PRACTICE_STAMP_MIN_ANSWERS - 1,
      programOpen: true,
      hasActiveCard: false,
      alreadyStampedToday: false,
      lastStampHktDate: null,
      storedStreak: 0,
      awardHktDate: awardDate,
    });
    expect(result.awarded).toBe(false);
    expect(result.reason).toBe("insufficient_answers");
  });

  it("awards once when answered count meets the threshold", () => {
    const result = evaluatePracticeStampAward({
      answeredCount: PRACTICE_STAMP_MIN_ANSWERS,
      programOpen: true,
      hasActiveCard: false,
      alreadyStampedToday: false,
      lastStampHktDate: null,
      storedStreak: 0,
      awardHktDate: awardDate,
    });
    expect(result).toEqual({ awarded: true, newStreak: 1, enrolsNewCard: true });
  });

  it("does not award a second stamp on the same HKT day", () => {
    const result = evaluatePracticeStampAward({
      answeredCount: 20,
      programOpen: true,
      hasActiveCard: true,
      alreadyStampedToday: true,
      lastStampHktDate: awardDate,
      storedStreak: 1,
      awardHktDate: awardDate,
    });
    expect(result.awarded).toBe(false);
    expect(result.reason).toBe("already_stamped_today");
  });

  it("resets streak to zero after missing a day until a new stamp is earned", () => {
    const yesterday = previousHktCalendarDate(awardDate);
    const twoDaysAgo = previousHktCalendarDate(yesterday);
    expect(effectivePracticeStampStreak(twoDaysAgo, awardDate, 5)).toBe(0);
    const afterGap = computePracticeStampStreakAfterAward(twoDaysAgo, 5, awardDate);
    expect(afterGap).toBe(1);
  });

  it("increments streak on consecutive HKT days", () => {
    const yesterday = previousHktCalendarDate(awardDate);
    expect(
      computePracticeStampStreakAfterAward(yesterday, 3, awardDate)
    ).toBe(4);
    expect(effectivePracticeStampStreak(yesterday, awardDate, 3)).toBe(3);
  });

  it("blocks new enrolment when the program is closed but still earns for mid-card students", () => {
    const closedNew = evaluatePracticeStampAward({
      answeredCount: 10,
      programOpen: false,
      hasActiveCard: false,
      alreadyStampedToday: false,
      lastStampHktDate: null,
      storedStreak: 0,
      awardHktDate: awardDate,
    });
    expect(closedNew.reason).toBe("enrolment_closed");

    const midCard = evaluatePracticeStampAward({
      answeredCount: 10,
      programOpen: false,
      hasActiveCard: true,
      alreadyStampedToday: false,
      lastStampHktDate: previousHktCalendarDate(awardDate),
      storedStreak: 2,
      awardHktDate: awardDate,
    });
    expect(midCard.awarded).toBe(true);
    expect(midCard.newStreak).toBe(3);
    expect(midCard.enrolsNewCard).toBe(false);
  });
});

describe("KPI test-mobile exclusion", () => {
  it("matches the project 9999 test-mobile rule", () => {
    expect(isExcludedTestMobileForKpi("99990003")).toBe(true);
    expect(isExcludedTestMobileForKpi("91917838")).toBe(false);
    expect(isExcludedTestMobileForKpi(null)).toBe(false);
  });
});

describe("HKT calendar helpers", () => {
  it("formats Hong Kong calendar dates", () => {
    const hkt = getHktCalendarDate(new Date("2026-10-27T16:00:00.000Z"));
    expect(hkt).toBe("2026-10-28");
  });
});
