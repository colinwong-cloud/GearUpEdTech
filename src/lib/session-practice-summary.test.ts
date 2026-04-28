import { describe, it, expect } from "vitest";
import {
  buildSessionPracticeSummary,
  buildSessionPracticeSummaryForParent,
  type AnswerLike,
} from "./session-practice-summary";
import type { Question } from "@/lib/types";

const q = (t: string, type: string, id: string): Question => ({
  id,
  past_paper_id: null,
  subject: "數學",
  question_type: type,
  paper_rank: "1",
  grade_level: "P4",
  content: "q",
  opt_a: "A",
  opt_b: "B",
  opt_c: null,
  opt_d: null,
  correct_answer: "A",
  explanation: null,
  image_url: null,
  created_at: "",
  question_key: null,
  source: null,
});

const mk = (type: string, id: string, correct: boolean): AnswerLike => ({
  question: q("x", type, id),
  isCorrect: correct,
});

describe("buildSessionPracticeSummary", () => {
  it("returns 50-80 字 for a mixed session", () => {
    const answers: AnswerLike[] = [
      mk("應用題", "1", true),
      mk("應用題", "2", true),
      mk("圖形題", "3", false),
      mk("圖形題", "4", false),
    ];
    const s = buildSessionPracticeSummary(answers, "數學");
    expect(s.length).toBeGreaterThanOrEqual(50);
    expect(s.length).toBeLessThanOrEqual(80);
  });

  it("mentions strong and weak type labels when two types differ", () => {
    const answers: AnswerLike[] = [
      mk("選擇題", "1", true),
      mk("選擇題", "2", true),
      mk("應用題", "3", false),
    ];
    const s = buildSessionPracticeSummary(answers, "數學");
    expect(s).toContain("選擇題");
    expect(s).toContain("應用題");
  });

  it("handles single question type", () => {
    const answers: AnswerLike[] = [mk("綜合", "1", true), mk("綜合", "2", false)];
    const s = buildSessionPracticeSummary(answers, "數學");
    expect(s.length).toBeGreaterThanOrEqual(20);
  });

  it("empty returns short fallback", () => {
    const s = buildSessionPracticeSummary([], "數學");
    expect(s.length).toBeGreaterThan(0);
  });
});

describe("buildSessionPracticeSummaryForParent", () => {
  it("differs from student summary and uses teacher-like wording", () => {
    const answers: AnswerLike[] = [
      mk("選擇題", "1", true),
      mk("選擇題", "2", true),
      mk("應用題", "3", false),
    ];
    const student = buildSessionPracticeSummary(answers, "數學");
    const parent = buildSessionPracticeSummaryForParent(answers, "數學", "小明");
    expect(parent).not.toBe(student);
    expect(parent).toContain("小明");
    expect(parent).toMatch(/關於|敬啟/);
    expect(parent.length).toBeGreaterThanOrEqual(40);
    expect(parent.length).toBeLessThanOrEqual(120);
  });
});
