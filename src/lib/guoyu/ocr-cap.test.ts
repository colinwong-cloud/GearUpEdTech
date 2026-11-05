import { describe, expect, it } from "vitest";
import { computeGuoyuOcrCap, computeGuoyuOcrRemaining } from "@/lib/guoyu/ocr-cap";

describe("guoyu OCR cap (Finance lock)", () => {
  const now = new Date("2026-11-05T12:00:00.000Z");

  it("gives tutors cap 1 even when paid_until is active", () => {
    expect(
      computeGuoyuOcrCap({
        paidUntil: "2026-12-01T00:00:00.000Z",
        isTutorParent: true,
        now,
      })
    ).toBe(1);
  });

  it("gives paid parent cap 10 when paid_until >= now", () => {
    expect(
      computeGuoyuOcrCap({
        paidUntil: "2026-12-01T00:00:00.000Z",
        isTutorParent: false,
        now,
      })
    ).toBe(10);
  });

  it("drops to cap 1 when paid_until expired (usage unchanged semantics via remaining)", () => {
    const cap = computeGuoyuOcrCap({
      paidUntil: "2026-10-01T00:00:00.000Z",
      isTutorParent: false,
      now,
    });
    expect(cap).toBe(1);
    expect(computeGuoyuOcrRemaining(cap, 3)).toBe(0);
  });

  it("remaining is max(0, cap - used)", () => {
    expect(computeGuoyuOcrRemaining(10, 7)).toBe(3);
    expect(computeGuoyuOcrRemaining(10, 12)).toBe(0);
    expect(computeGuoyuOcrRemaining(1, 0)).toBe(1);
  });
});
