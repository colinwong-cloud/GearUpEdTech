import { describe, expect, it } from "vitest";
import {
  TUTOR_COMPARISON_MONTHLY_PRICE_HKD,
  buildPeerComparison,
  tutorComparisonUnlocked,
} from "./tutor-student-comparison";

const studentId = "student-a";

describe("tutor student comparison", () => {
  it("treats a future paid_until as unlocked", () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    expect(tutorComparisonUnlocked(null, now)).toBe(false);
    expect(tutorComparisonUnlocked("2026-09-01T00:00:00.000Z", now)).toBe(false);
    expect(tutorComparisonUnlocked("2026-10-31T00:00:00.000Z", now)).toBe(true);
    expect(TUTOR_COMPARISON_MONTHLY_PRICE_HKD).toBe(199);
  });

  it("ranks the student against school, district, and grade", () => {
    const result = buildPeerComparison({
      studentId,
      schoolId: "school-1",
      district: "沙田",
      members: [
        { studentId, schoolId: "school-1", district: "沙田", accuracy: 70 },
        { studentId: "b", schoolId: "school-1", district: "沙田", accuracy: 90 },
        { studentId: "c", schoolId: "school-1", district: "沙田", accuracy: 60 },
        { studentId: "d", schoolId: "school-2", district: "沙田", accuracy: 80 },
        { studentId: "e", schoolId: "school-3", district: "九龍城", accuracy: 50 },
      ],
    });
    expect(result.studentAccuracy).toBe(70);
    expect(result.school).toEqual({ average: 73.3, count: 3, rank: 2 });
    expect(result.district).toEqual({ average: 75, count: 4, rank: 3 });
    expect(result.grade).toEqual({ average: 70, count: 5, rank: 3 });
  });

  it("leaves school and district empty when the student has no school", () => {
    const result = buildPeerComparison({
      studentId,
      schoolId: null,
      district: null,
      members: [{ studentId, schoolId: null, district: null, accuracy: 40 }],
    });
    expect(result.school).toBeNull();
    expect(result.district).toBeNull();
    expect(result.grade.rank).toBe(1);
  });

  it("does not rank a student who has no practice yet", () => {
    const result = buildPeerComparison({
      studentId,
      schoolId: "school-1",
      district: "沙田",
      members: [
        { studentId, schoolId: "school-1", district: "沙田", accuracy: null },
        { studentId: "b", schoolId: "school-1", district: "沙田", accuracy: 80 },
      ],
    });
    expect(result.studentAccuracy).toBeNull();
    expect(result.school).toEqual({ average: 80, count: 1, rank: null });
  });
});
