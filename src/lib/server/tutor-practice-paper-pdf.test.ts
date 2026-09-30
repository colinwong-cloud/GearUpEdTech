import { describe, expect, it } from "vitest";
import { buildPracticePaperPdf } from "./tutor-practice-paper-pdf";
import type { PracticePaperQuestion } from "@/lib/tutor-practice-paper";

const sample: PracticePaperQuestion = {
  id: "q1",
  content: "3 + 4 = ?",
  opt_a: "6",
  opt_b: "7",
  opt_c: "8",
  opt_d: null,
  correct_answer: "B",
  explanation: "3 加 4 是 7。",
  image_url: null,
};

describe("buildPracticePaperPdf", () => {
  it("builds a student paper and an answer paper in Chinese", async () => {
    const questions = Array.from({ length: 2 }, (_, index) => ({
      ...sample,
      id: `q${index}`,
      content: index === 0 ? "小明有 3 本書。" : sample.content,
    }));
    const student = await buildPracticePaperPdf({
      kind: "student",
      studentName: "陳小明",
      gradeLevel: "P4",
      subjectKey: "Math",
      createdAt: new Date("2026-09-30T02:00:00.000Z"),
      questions,
    });
    const answer = await buildPracticePaperPdf({
      kind: "answer",
      studentName: "陳小明",
      gradeLevel: "P4",
      subjectKey: "Math",
      createdAt: new Date("2026-09-30T02:00:00.000Z"),
      questions,
    });
    expect(Buffer.from(student).subarray(0, 5).toString()).toBe("%PDF-");
    expect(Buffer.from(answer).subarray(0, 5).toString()).toBe("%PDF-");
    expect(student.byteLength).toBeGreaterThan(1000);
    expect(answer.byteLength).toBeGreaterThan(student.byteLength);
  }, 20000);
});
