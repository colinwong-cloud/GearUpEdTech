import { describe, expect, it } from "vitest";
import {
  buildMitSubsequentConfirmPayload,
  classifyRecurringChargeFailure,
  isConsentPermanentlyUnusable,
  isConsentUsableForMit,
} from "./recurring-mit-confirm";

describe("buildMitSubsequentConfirmPayload", () => {
  it("uses top-level triggered_by and consent id, without external_recurring_data", () => {
    const payload = buildMitSubsequentConfirmPayload({
      customerId: "cus_1",
      paymentMethodId: "mtd_1",
      paymentMethodType: "card",
      paymentConsentId: "cst_1",
      requestId: "req_1",
      metadata: {
        recurring_profile_id: "prof_1",
        mobile_number: "91917838",
      },
    });

    expect(payload.triggered_by).toBe("merchant");
    expect(payload.payment_consent_id).toBe("cst_1");
    expect(payload.customer_id).toBe("cus_1");
    expect(payload.payment_method).toEqual({ id: "mtd_1", type: "card" });
    expect(payload.external_recurring_data).toBeUndefined();
    expect(payload.metadata).toMatchObject({
      merchant_trigger_reason: "scheduled",
      charge_type: "monthly_recurring",
      mobile_number: "91917838",
    });
  });
});

describe("consent usability", () => {
  it("accepts only VERIFIED consents for MIT charge", () => {
    expect(isConsentUsableForMit("VERIFIED")).toBe(true);
    expect(isConsentUsableForMit("verified")).toBe(true);
    expect(isConsentUsableForMit("REQUIRES_CUSTOMER_ACTION")).toBe(false);
    expect(isConsentUsableForMit("DISABLED")).toBe(false);
    expect(isConsentUsableForMit(null)).toBe(false);
  });

  it("treats DISABLED as permanent", () => {
    expect(isConsentPermanentlyUnusable("DISABLED")).toBe(true);
    expect(isConsentPermanentlyUnusable("VERIFIED")).toBe(false);
  });
});

describe("classifyRecurringChargeFailure", () => {
  it("keeps confirm validation errors retryable so the next cron can charge", () => {
    expect(
      classifyRecurringChargeFailure({
        reason: "Airwallex payment_intents/confirm failed (400) [validation_error]: triggered_by is required",
      })
    ).toBe("retryable");
  });

  it("marks issuer declines and disabled consents as permanent", () => {
    expect(
      classifyRecurringChargeFailure({
        reason: "Airwallex payment_intents/confirm failed (400) [issuer_declined]: Insufficient funds",
      })
    ).toBe("permanent");
    expect(
      classifyRecurringChargeFailure({
        reason: "Payment consent is not usable for MIT (status=DISABLED)",
        consentStatus: "DISABLED",
      })
    ).toBe("permanent");
    expect(
      classifyRecurringChargeFailure({
        reason: "Payment consent is not usable for MIT (status=DISABLED)",
      })
    ).toBe("permanent");
    expect(
      classifyRecurringChargeFailure({
        reason: "Missing recurring payment credentials (customer/payment_method/payment_consent)",
      })
    ).toBe("permanent");
  });
});
