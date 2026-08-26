import { describe, expect, it } from "vitest";
import {
  computeTutorStudentHash,
  computeTutorStudentScopeHash,
  tutorHashesEqual,
} from "./tutor-student-hash";

const SECRET = "unit-test-secret-value";

describe("computeTutorStudentHash", () => {
  it("produces a stable 64-char hex digest", () => {
    const hash = computeTutorStudentHash("91919195", SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same mobile and secret", () => {
    expect(computeTutorStudentHash("91919195", SECRET)).toBe(
      computeTutorStudentHash("91919195", SECRET)
    );
  });

  it("normalizes surrounding whitespace to the same digest", () => {
    expect(computeTutorStudentHash("  91919195 ", SECRET)).toBe(
      computeTutorStudentHash("91919195", SECRET)
    );
  });

  it("never exposes the raw mobile inside the digest", () => {
    const hash = computeTutorStudentHash("91919195", SECRET);
    expect(hash.includes("91919195")).toBe(false);
  });

  it("differs across mobiles", () => {
    expect(computeTutorStudentHash("91919195", SECRET)).not.toBe(
      computeTutorStudentHash("91919196", SECRET)
    );
  });

  it("differs across secrets", () => {
    expect(computeTutorStudentHash("91919195", SECRET)).not.toBe(
      computeTutorStudentHash("91919195", "another-secret")
    );
  });
});

describe("computeTutorStudentScopeHash", () => {
  it("produces a stable 64-char hex digest", () => {
    const hash = computeTutorStudentScopeHash("91919195", "stu-1", SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same mobile, student, and secret", () => {
    expect(computeTutorStudentScopeHash("91919195", "stu-1", SECRET)).toBe(
      computeTutorStudentScopeHash("91919195", "stu-1", SECRET)
    );
  });

  it("differs across siblings under the same mobile", () => {
    expect(computeTutorStudentScopeHash("91919195", "stu-1", SECRET)).not.toBe(
      computeTutorStudentScopeHash("91919195", "stu-2", SECRET)
    );
  });

  it("differs from the mobile-only v1 hash", () => {
    expect(computeTutorStudentScopeHash("91919195", "stu-1", SECRET)).not.toBe(
      computeTutorStudentHash("91919195", SECRET)
    );
  });

  it("never exposes mobile or student id inside the digest", () => {
    const hash = computeTutorStudentScopeHash("91919195", "stu-1", SECRET);
    expect(hash.includes("91919195")).toBe(false);
    expect(hash.includes("stu-1")).toBe(false);
  });
});

describe("tutorHashesEqual", () => {
  it("accepts matching hashes", () => {
    const hash = computeTutorStudentScopeHash("91919195", "stu-1", SECRET);
    expect(tutorHashesEqual(hash, hash)).toBe(true);
  });

  it("rejects different hashes", () => {
    const a = computeTutorStudentScopeHash("91919195", "stu-1", SECRET);
    const b = computeTutorStudentScopeHash("91919195", "stu-2", SECRET);
    expect(tutorHashesEqual(a, b)).toBe(false);
  });
});
