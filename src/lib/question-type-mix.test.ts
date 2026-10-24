import { describe, expect, it } from "vitest";
import type { ParentWeight, Question } from "./types";
import {
  allTypesEnabledInMix,
  buildQuestionTypeMixAllOffMessage,
  buildSoftPoolShortfallMessage,
  composeWeightsWithEnabledTypes,
  distinctQuestionTypesFromPool,
  filterQuestionsByEnabledTypes,
  isAtLeastOneQuestionTypeEnabled,
  planQuizQuestionDraw,
} from "./question-type-mix";

function q(id: string, type: string): Question {
  return {
    id,
    question_type: type,
    subject: "Chinese",
    grade_level: "P3",
    source: "AI",
    question_text: "x",
    correct_answer: "a",
    created_at: "",
    updated_at: "",
  } as Question;
}

describe("question-type-mix", () => {
  it("derives distinct types from pool preserving labels", () => {
    const types = distinctQuestionTypesFromPool([
      q("1", "閱讀理解"),
      q("2", "閱讀理解"),
      q("3", "詞語"),
    ]);
    expect(types).toEqual(["詞語", "閱讀理解"]);
  });

  it("filters questions by enabled types (case-insensitive)", () => {
    const pool = [q("1", "MC"), q("2", "Short Answer"), q("3", "mc")];
    const filtered = filterQuestionsByEnabledTypes(pool, new Set(["mc"]));
    expect(filtered.map((x) => x.id)).toEqual(["1", "3"]);
  });

  it("composes parent weights with enabled types only", () => {
    const weights: ParentWeight[] = [
      { id: "1", question_type: "A", weight_percentage: 50, student_id: "s", subject: "Math" },
      { id: "2", question_type: "B", weight_percentage: 50, student_id: "s", subject: "Math" },
      { id: "3", question_type: "C", weight_percentage: 0, student_id: "s", subject: "Math" },
    ];
    const composed = composeWeightsWithEnabledTypes(weights, new Set(["A", "C"]));
    expect(composed).toHaveLength(1);
    expect(composed[0].question_type).toBe("A");
  });

  it("guards all-off selection", () => {
    expect(isAtLeastOneQuestionTypeEnabled(new Set())).toBe(false);
    expect(buildQuestionTypeMixAllOffMessage()).toBe("請至少選擇一種題型");
  });

  it("soft-warn when filtered pool is smaller than requested", () => {
    const plan = planQuizQuestionDraw({
      subjectKey: "Chinese",
      gradeLevel: "P3",
      requestedCount: 10,
      totalPoolSize: 100,
      filteredPoolSize: 4,
      allTypesEnabled: false,
    });
    expect(plan.effectiveCount).toBe(4);
    expect(plan.strictErrorMessage).toBeNull();
    expect(plan.softWarnMessage).toBe(buildSoftPoolShortfallMessage(4));
  });

  it("strict error when full pool too small and all types enabled", () => {
    const plan = planQuizQuestionDraw({
      subjectKey: "Math",
      gradeLevel: "P3",
      requestedCount: 10,
      totalPoolSize: 3,
      filteredPoolSize: 3,
      allTypesEnabled: true,
    });
    expect(plan.strictErrorMessage).toContain("AI 題庫不足");
    expect(plan.softWarnMessage).toBeNull();
  });

  it("detects when every pool type is enabled", () => {
    expect(allTypesEnabledInMix(["A", "B"], new Set(["A", "B"]))).toBe(true);
    expect(allTypesEnabledInMix(["A", "B"], new Set(["A"]))).toBe(false);
  });
});
