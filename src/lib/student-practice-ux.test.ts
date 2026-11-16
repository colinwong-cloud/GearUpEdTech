import { describe, expect, it } from "vitest";
import {
  PRACTICE_FINISH_DISABLED_REASON,
  PRACTICE_NAV_FINISH_LABEL,
  PRACTICE_NAV_NEXT_LABEL,
  PRACTICE_NAV_PREV_LABEL,
  canUsePracticeNext,
  canUsePracticePrev,
  countSessionAnswers,
  everyQuestionAnswered,
  practiceFinishEnabled,
  showPracticeFinishButton,
  summarizeCollapsedQuestionTypes,
} from "./student-practice-ux";

describe("student-practice-ux (Soft #260)", () => {
  it("summarizes collapsed question-type selection", () => {
    expect(summarizeCollapsedQuestionTypes(5, 5)).toBe("全部");
    expect(summarizeCollapsedQuestionTypes(5, 2)).toBe("已選 2 種");
  });

  it("counts answered questions for star progress and 完成", () => {
    const choices = { 0: "A", 2: "B" } as Record<number, string>;
    expect(countSessionAnswers(choices, 4)).toBe(2);
    expect(everyQuestionAnswered(choices, 4)).toBe(false);
    expect(practiceFinishEnabled(choices, 4)).toBe(false);
  });

  it("enables 完成 only when every question is answered", () => {
    const all = { 0: "A", 1: "C", 2: "B" };
    expect(everyQuestionAnswered(all, 3)).toBe(true);
    expect(practiceFinishEnabled(all, 3)).toBe(true);
  });

  it("navigation locks: 上一題 disabled on Q1, 下一題 without answer", () => {
    expect(canUsePracticePrev(0)).toBe(false);
    expect(canUsePracticePrev(1)).toBe(true);
    expect(canUsePracticeNext(0, 3)).toBe(true);
    expect(canUsePracticeNext(2, 3)).toBe(false);
  });

  it("shows 完成 on last question instead of 下一題", () => {
    expect(showPracticeFinishButton(2, 3)).toBe(true);
    expect(showPracticeFinishButton(1, 3)).toBe(false);
  });

  it("uses owner Traditional Chinese copy", () => {
    expect(PRACTICE_NAV_PREV_LABEL).toBe("上一題");
    expect(PRACTICE_NAV_NEXT_LABEL).toBe("下一題");
    expect(PRACTICE_NAV_FINISH_LABEL).toBe("完成");
    expect(PRACTICE_FINISH_DISABLED_REASON).toBe("尚有題目未作答");
  });
});