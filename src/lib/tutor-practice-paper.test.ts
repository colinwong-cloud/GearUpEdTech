import { describe, expect, it } from "vitest";
import {
  FREE_PRACTICE_PAPER_MONTHLY_LIMIT,
  PRACTICE_PAPER_QUESTION_COUNT,
  gradeDisplayLabel,
  hktDateLabel,
  hktMonthKey,
  pickPracticeQuestions,
  practicePaperQuotaError,
  remainingPracticePapers,
} from "./tutor-practice-paper";

describe("tutor practice paper rules", () => {
  it("uses the Hong Kong calendar month", () => {
    expect(hktMonthKey(new Date("2026-09-30T15:59:00.000Z"))).toBe("2026-09");
    expect(hktMonthKey(new Date("2026-09-30T16:00:00.000Z"))).toBe("2026-10");
    expect(hktDateLabel(new Date("2026-09-30T16:00:00.000Z"))).toBe("01/10/2026");
  });

  it("labels primary grades in Chinese", () => {
    expect(gradeDisplayLabel("P4")).toBe("小四");
    expect(gradeDisplayLabel("p1")).toBe("小一");
  });

  it("allows four papers in a month and blocks the fifth", () => {
    expect(FREE_PRACTICE_PAPER_MONTHLY_LIMIT).toBe(4);
    expect(practicePaperQuotaError(3)).toBeNull();
    expect(remainingPracticePapers(3)).toBe(1);
    expect(practicePaperQuotaError(4)).toContain("4");
    expect(remainingPracticePapers(4)).toBe(0);
  });

  it("picks exactly 30 questions and refuses a short pool", () => {
    const pool = Array.from({ length: 40 }, (_, index) => index + 1);
    const picked = pickPracticeQuestions(pool, PRACTICE_PAPER_QUESTION_COUNT, () => 0);
    expect(picked).toHaveLength(30);
    expect(new Set(picked).size).toBe(30);
    expect(pickPracticeQuestions(pool.slice(0, 29), 30, () => 0)).toBeNull();
  });
});
