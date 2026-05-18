import { describe, expect, it } from "vitest";
import {
  AI_QUESTION_SOURCE,
  buildStrictAiQuestionPoolErrorMessage,
  isAiQuestionSource,
  normalizeQuestionSource,
} from "./question-source";

describe("question-source helpers", () => {
  it("normalizes source tokens to uppercase and trims spaces", () => {
    expect(normalizeQuestionSource(" ai ")).toBe("AI");
    expect(normalizeQuestionSource("Pdf")).toBe("PDF");
  });

  it("detects AI source strictly after normalization", () => {
    expect(isAiQuestionSource("AI")).toBe(true);
    expect(isAiQuestionSource(" ai ")).toBe(true);
    expect(isAiQuestionSource("PDF")).toBe(false);
    expect(isAiQuestionSource(null)).toBe(false);
  });

  it("keeps canonical AI source constant", () => {
    expect(AI_QUESTION_SOURCE).toBe("AI");
  });

  it("builds strict AI pool error message with context", () => {
    const msg = buildStrictAiQuestionPoolErrorMessage({
      subjectKey: "Math",
      gradeLevel: "P3",
      requestedCount: 10,
      availableCount: 4,
    });
    expect(msg).toContain("AI 題庫不足");
    expect(msg).toContain("數學");
    expect(msg).toContain("P3");
    expect(msg).toContain("4 題");
    expect(msg).toContain("10 題");
  });
});
