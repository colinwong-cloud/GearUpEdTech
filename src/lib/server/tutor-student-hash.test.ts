import { describe, expect, it } from "vitest";
import { computeTutorStudentHash } from "./tutor-student-hash";

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
