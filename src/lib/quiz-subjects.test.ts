import { describe, expect, it } from "vitest";
import {
  CHINESE_QUIZ_SUBJECT,
  PRIMARY_QUIZ_SUBJECT,
  quizSubjectDbPatterns,
  subjectDisplayLabel,
} from "./quiz-subjects";

describe("quizSubjectDbPatterns", () => {
  it("merges Math with legacy 數學", () => {
    expect(quizSubjectDbPatterns(PRIMARY_QUIZ_SUBJECT)).toEqual(["Math", "數學"]);
  });

  it("returns Chinese only", () => {
    expect(quizSubjectDbPatterns(CHINESE_QUIZ_SUBJECT)).toEqual(["Chinese"]);
  });
});

describe("subjectDisplayLabel", () => {
  it("maps DB keys to UI labels", () => {
    expect(subjectDisplayLabel("Math")).toBe("數學");
    expect(subjectDisplayLabel("Chinese")).toBe("中文");
  });
});
