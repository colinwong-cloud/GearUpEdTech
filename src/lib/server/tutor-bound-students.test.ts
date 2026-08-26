import { describe, expect, it } from "vitest";
import { findBoundStudentByHash, type TutorBoundStudent } from "./tutor-bound-students";
import { computeTutorStudentHash, computeTutorStudentScopeHash } from "./tutor-student-hash";

const SECRET = "unit-test-secret-value";

const students: TutorBoundStudent[] = [
  {
    studentId: "stu-1",
    studentName: "小明",
    registeredMobile: "91919195",
    linkedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    studentId: "stu-2",
    studentName: "小美",
    registeredMobile: "91919195",
    linkedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("findBoundStudentByHash", () => {
  it("resolves a v2 hash to that student only", () => {
    const hash = computeTutorStudentScopeHash("91919195", "stu-2", SECRET);
    const found = findBoundStudentByHash(students, hash, SECRET);
    expect(found?.studentId).toBe("stu-2");
    expect(found?.studentName).toBe("小美");
  });

  it("does not resolve a legacy mobile-only v1 hash", () => {
    const hash = computeTutorStudentHash("91919195", SECRET);
    expect(findBoundStudentByHash(students, hash, SECRET)).toBeNull();
  });
});
