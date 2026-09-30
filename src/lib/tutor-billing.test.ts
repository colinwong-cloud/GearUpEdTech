import { describe, expect, it } from "vitest";
import {
  TUTOR_PLAN_PRICE_HKD,
  extendTutorPaidUntil,
  isTutorMerchantOrderId,
  tutorMerchantOrderId,
} from "./tutor-billing";

describe("tutor billing", () => {
  it("charges 199 HKD and tags tutor orders", () => {
    expect(TUTOR_PLAN_PRICE_HKD).toBe(199);
    const orderId = tutorMerchantOrderId("123456", new Date("2026-09-30T00:00:00.000Z"));
    expect(orderId.startsWith("tutor-123456-")).toBe(true);
    expect(isTutorMerchantOrderId(orderId)).toBe(true);
    expect(isTutorMerchantOrderId("GU-123")).toBe(false);
  });

  it("extends a lapsed plan from now and an active plan from paid_until", () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    expect(extendTutorPaidUntil(null, now)).toBe("2026-10-30T00:00:00.000Z");
    expect(extendTutorPaidUntil("2026-09-01T00:00:00.000Z", now)).toBe("2026-10-30T00:00:00.000Z");
    expect(extendTutorPaidUntil("2026-11-15T00:00:00.000Z", now)).toBe("2026-12-15T00:00:00.000Z");
  });
});
