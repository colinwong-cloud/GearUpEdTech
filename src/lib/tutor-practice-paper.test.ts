import { describe, expect, it } from "vitest";
import {
  FREE_PRACTICE_PAPER_MONTHLY_LIMIT,
  PRACTICE_PAPER_OVERVIEW_DAYS,
  PRACTICE_PAPER_QUESTION_COUNT,
  filenameFromContentDisposition,
  gradeDisplayLabel,
  hktDateLabel,
  hktMonthKey,
  hktMonthLabel,
  pickPracticeQuestions,
  practicePaperOverviewSince,
  practicePaperDownloadFilename,
  practicePaperMobileSuffix,
  practicePaperQuotaError,
  remainingPracticePapers,
} from "./tutor-practice-paper";

describe("tutor practice paper rules", () => {
  it("uses the Hong Kong calendar month", () => {
    expect(hktMonthKey(new Date("2026-09-30T15:59:00.000Z"))).toBe("2026-09");
    expect(hktMonthKey(new Date("2026-09-30T16:00:00.000Z"))).toBe("2026-10");
    expect(hktMonthLabel("2026-10")).toBe("2026年10月");
    expect(PRACTICE_PAPER_OVERVIEW_DAYS).toBe(180);
    expect(practicePaperOverviewSince(new Date("2026-10-01T04:00:00.000Z")).toISOString()).toBe(
      "2026-04-04T04:00:00.000Z"
    );
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
    expect(practicePaperQuotaError(9, null)).toBeNull();
    expect(remainingPracticePapers(9, null)).toBeNull();
  });

  it("names each download with the mobile tail and a Hong Kong timestamp", () => {
    const createdAt = new Date("2026-09-30T16:00:00.000Z");
    expect(practicePaperMobileSuffix("91234567")).toBe("4567");
    expect(practicePaperMobileSuffix("+852 9123 4567")).toBe("4567");
    expect(practicePaperMobileSuffix("")).toBe("0000");
    const student = practicePaperDownloadFilename({
      subjectLabel: "數學",
      studentName: "陳小明",
      mobile: "91234567",
      kind: "student",
      createdAt,
    });
    const answer = practicePaperDownloadFilename({
      subjectLabel: "數學",
      studentName: "陳小明",
      mobile: "91234567",
      kind: "answer",
      createdAt,
    });
    expect(student.unicode).toBe("GearUp-數學-陳小明-4567-20261001-000000-學生卷.pdf");
    expect(student.ascii).toBe("gearup-4567-20261001-000000-student.pdf");
    expect(answer.unicode).toContain("答案卷");
    expect(answer.ascii).not.toBe(student.ascii);
    const header = `attachment; filename="${student.ascii}"; filename*=UTF-8''${encodeURIComponent(student.unicode)}`;
    expect(filenameFromContentDisposition(header, "gearup-practice-student.pdf")).toBe(student.unicode);
  });

  it("picks exactly 30 questions and refuses a short pool", () => {
    const pool = Array.from({ length: 40 }, (_, index) => index + 1);
    const picked = pickPracticeQuestions(pool, PRACTICE_PAPER_QUESTION_COUNT, () => 0);
    expect(picked).toHaveLength(30);
    expect(new Set(picked).size).toBe(30);
    expect(pickPracticeQuestions(pool.slice(0, 29), 30, () => 0)).toBeNull();
  });
});
