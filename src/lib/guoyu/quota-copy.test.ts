import { describe, expect, it } from "vitest";
import {
  formatGuoyuOcrQuotaLine,
  formatGuoyuTtsQuotaLine,
  GUOYU_QUOTA_CIRCLE_EXPLAINER,
  guoyuQuotaCircleTotal,
  guoyuQuotaCirclesUsed,
  guoyuTtsQuotaExhausted,
} from "@/lib/guoyu/quota-copy";

describe("guoyu OCR quota copy and circles", () => {
  it("keeps owner-locked circle legend copy", () => {
    expect(GUOYU_QUOTA_CIRCLE_EXPLAINER).toBe(
      "綠勾勾＝已用額度；空心＝尚餘額度。月費用戶每月可享 10 次額度；免費用戶則每月 1 次。拼音、掃描同朗讀分開計。"
    );
  });

  it("keeps owner-locked free tier line for screen readers", () => {
    expect(
      formatGuoyuOcrQuotaLine({ remaining: 1, cap: 1, isPaidMit: false })
    ).toContain("免費 OCR：本月尚餘");
  });

  it("paid MIT shows 10 circles with used = cap display minus remaining", () => {
    const view = { remaining: 7, cap: 10, isPaidMit: true };
    expect(guoyuQuotaCircleTotal(view)).toBe(10);
    expect(guoyuQuotaCirclesUsed(view)).toBe(3);
  });

  it("free tier shows one circle; used when remaining is 0", () => {
    expect(
      guoyuQuotaCircleTotal({ remaining: 1, cap: 1, isPaidMit: false })
    ).toBe(1);
    expect(
      guoyuQuotaCirclesUsed({ remaining: 0, cap: 1, isPaidMit: false })
    ).toBe(1);
    expect(
      guoyuQuotaCirclesUsed({ remaining: 1, cap: 1, isPaidMit: false })
    ).toBe(0);
  });
});

describe("guoyu TTS quota copy", () => {
  it("formats paid and free TTS quota lines", () => {
    expect(
      formatGuoyuTtsQuotaLine({ remaining: 7, cap: 10, isPaidMit: true })
    ).toContain("朗讀本月尚餘 7 次");
    expect(
      formatGuoyuTtsQuotaLine({ remaining: 0, cap: 1, isPaidMit: false })
    ).toContain("免費朗讀額度已用完");
  });

  it("exhausted only when rpc is ready and remaining is 0", () => {
    expect(guoyuTtsQuotaExhausted(0, true)).toBe(true);
    expect(guoyuTtsQuotaExhausted(0, false)).toBe(false);
    expect(guoyuTtsQuotaExhausted(1, true)).toBe(false);
  });
});
