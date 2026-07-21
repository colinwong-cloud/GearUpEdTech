import { describe, expect, it } from "vitest";
import {
  buildPaidTransactionsCsv,
  getCurrentHktMonthKey,
  getHktMonthRangeIso,
  isValidMonthKey,
} from "./admin-paid-summary";

describe("admin-paid-summary month helpers", () => {
  it("validates month key format", () => {
    expect(isValidMonthKey("2026-05")).toBe(true);
    expect(isValidMonthKey("2026-5")).toBe(false);
    expect(isValidMonthKey("26-05")).toBe(false);
  });

  it("returns HKT month from fixed UTC timestamp", () => {
    const value = getCurrentHktMonthKey(new Date("2026-01-31T20:30:00.000Z"));
    expect(value).toBe("2026-02");
  });

  it("converts month key to HKT-aware UTC range", () => {
    const range = getHktMonthRangeIso("2026-05");
    expect(range.startIso).toBe("2026-04-30T16:00:00.000Z");
    expect(range.endIso).toBe("2026-05-31T16:00:00.000Z");
  });
});

describe("buildPaidTransactionsCsv", () => {
  it("outputs csv with expected headers and values", () => {
    const csv = buildPaidTransactionsCsv([
      {
        id: "po_1",
        mobile_number: "91234567",
        parent_name: "王小明",
        merchant_order_id: "M0001",
        status: "paid",
        paid_at: "2026-05-10T09:00:00.000Z",
        created_at: "2026-05-10T08:59:00.000Z",
        final_amount_hkd: 99,
        payment_method: "Apple Pay",
        is_recurring_payment: true,
        airwallex_payment_intent_id: "pi_abc",
        airwallex_payment_attempt_id: "pa_abc",
      },
    ]);
    expect(csv).toContain("mobile_number,parent_name,merchant_order_id");
    expect(csv).toContain("91234567");
    expect(csv).toContain("Apple Pay");
  });
});
