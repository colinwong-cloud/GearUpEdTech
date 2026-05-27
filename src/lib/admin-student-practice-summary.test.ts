import { describe, expect, it } from "vitest";
import { buildStudentPracticeSummaryRows } from "./admin-student-practice-summary";

describe("buildStudentPracticeSummaryRows", () => {
  it("aggregates by student, date and subject", () => {
    const rows = buildStudentPracticeSummaryRows([
      {
        student_id: "s1",
        subject: "Math",
        score: 8,
        questions_attempted: 10,
        created_at: "2026-05-18T01:00:00.000Z",
        hkt_practice_date: "2026-05-18",
      },
      {
        student_id: "s1",
        subject: "Math",
        score: 7,
        questions_attempted: 10,
        created_at: "2026-05-18T03:00:00.000Z",
        hkt_practice_date: "2026-05-18",
      },
      {
        student_id: "s1",
        subject: "Chinese",
        score: 9,
        questions_attempted: 10,
        created_at: "2026-05-18T05:00:00.000Z",
        hkt_practice_date: "2026-05-18",
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      student_id: "s1",
      practice_date: "2026-05-18",
      subject: "Chinese",
      sessions_count: 1,
      questions_attempted: 10,
      correct_count: 9,
      correct_rate: 90,
    });
    expect(rows[1]).toMatchObject({
      student_id: "s1",
      practice_date: "2026-05-18",
      subject: "Math",
      sessions_count: 2,
      questions_attempted: 20,
      correct_count: 15,
      correct_rate: 75,
    });
  });

  it("falls back to HKT date derived from created_at", () => {
    const rows = buildStudentPracticeSummaryRows([
      {
        student_id: "s2",
        subject: "數學",
        score: 5,
        questions_attempted: 10,
        created_at: "2026-05-17T16:30:00.000Z",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      student_id: "s2",
      practice_date: "2026-05-18",
      subject: "Math",
      correct_rate: 50,
    });
  });

  it("ignores invalid rows and clamps correct count", () => {
    const rows = buildStudentPracticeSummaryRows([
      {
        student_id: "s3",
        subject: "English",
        score: 20,
        questions_attempted: 10,
        created_at: "2026-05-18T01:00:00.000Z",
      },
      {
        student_id: "s3",
        subject: "English",
        score: 1,
        questions_attempted: 0,
        created_at: "2026-05-18T02:00:00.000Z",
      },
      {
        student_id: "",
        subject: "English",
        score: 1,
        questions_attempted: 10,
        created_at: "2026-05-18T03:00:00.000Z",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      student_id: "s3",
      questions_attempted: 10,
      correct_count: 10,
      correct_rate: 100,
    });
  });
});
