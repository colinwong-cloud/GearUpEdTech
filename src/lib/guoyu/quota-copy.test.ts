import { describe, expect, it } from "vitest";
import {
  formatGuoyuOcrQuotaLine,
  guoyuOcrQuotaCircleTotal,
  guoyuOcrQuotaCirclesUsed,
} from "@/lib/guoyu/quota-copy";

describe("guoyu OCR quota copy and circles", () => {
  it("keeps owner-locked free tier line for screen readers", () => {
    expect(
      formatGuoyuOcrQuotaLine({ remaining: 1, cap: 1, isPaidMit: false })
    ).toContain("免費 OCR：本月尚餘");
  });

  it("paid MIT shows 10 circles with used = cap display minus remaining", () => {
    const view = { remaining: 7, cap: 10, isPaidMit: true };
    expect(guoyuOcrQuotaCircleTotal(view)).toBe(10);
    expect(guoyuOcrQuotaCirclesUsed(view)).toBe(3);
  });

  it("free tier shows one circle; used when remaining is 0", () => {
    expect(
      guoyuOcrQuotaCircleTotal({ remaining: 1, cap: 1, isPaidMit: false })
    ).toBe(1);
    expect(
      guoyuOcrQuotaCirclesUsed({ remaining: 0, cap: 1, isPaidMit: false })
    ).toBe(1);
    expect(
      guoyuOcrQuotaCirclesUsed({ remaining: 1, cap: 1, isPaidMit: false })
    ).toBe(0);
  });
});
