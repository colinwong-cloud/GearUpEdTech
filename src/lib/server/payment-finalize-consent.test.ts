import { describe, expect, it } from "vitest";
import { pickBestPaymentConsentForMit } from "./payment-finalize";

describe("pickBestPaymentConsentForMit", () => {
  it("prefers VERIFIED consent matching the payment intent", () => {
    const best = pickBestPaymentConsentForMit(
      [
        {
          id: "cst_old",
          status: "VERIFIED",
          next_triggered_by: "merchant",
          merchant_trigger_reason: "scheduled",
          initial_payment_intent_id: "int_other",
          payment_method_id: "mtd_1",
          created_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "cst_match",
          status: "VERIFIED",
          next_triggered_by: "merchant",
          merchant_trigger_reason: "scheduled",
          initial_payment_intent_id: "int_target",
          payment_method: { id: "mtd_2", type: "applepay" },
          created_at: "2026-08-10T00:00:00.000Z",
        },
        {
          id: "cst_unverified",
          status: "REQUIRES_CUSTOMER_ACTION",
          next_triggered_by: "merchant",
          merchant_trigger_reason: "scheduled",
          initial_payment_intent_id: "int_target",
          payment_method_id: "mtd_3",
          created_at: "2026-08-11T00:00:00.000Z",
        },
      ],
      "int_target"
    );
    expect(best?.id).toBe("cst_match");
  });

  it("returns null when no VERIFIED consent exists", () => {
    const best = pickBestPaymentConsentForMit(
      [
        {
          id: "cst_action",
          status: "REQUIRES_CUSTOMER_ACTION",
          next_triggered_by: "merchant",
          merchant_trigger_reason: "scheduled",
          payment_method_id: "mtd_1",
        },
      ],
      "int_target"
    );
    expect(best).toBeNull();
  });

  it("returns null for empty list", () => {
    expect(pickBestPaymentConsentForMit([], "int_target")).toBeNull();
  });
});
