import { describe, expect, it } from "vitest";
import {
  buildMitSubsequentConfirmPayload,
  classifyRecurringChargeFailure,
  isConsentPermanentlyUnusable,
  isConsentUsableForMit,
  MIT_TRIGGERED_BY_MERCHANT,
  nextMitConfirmTriggeredByRetry,
} from "./recurring-mit-confirm";

describe("buildMitSubsequentConfirmPayload", () => {
  it("omits triggered_by when payment_consent_id is present", () => {
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

    expect(payload.triggered_by).toBeUndefined();
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

  it("sends triggered_by=merchant only when explicitly requested or consent is missing", () => {
    const withFlag = buildMitSubsequentConfirmPayload(
      {
        customerId: "cus_1",
        paymentMethodId: "mtd_1",
        paymentMethodType: "card",
        paymentConsentId: "cst_1",
        requestId: "req_2",
      },
      { includeTriggeredBy: true }
    );
    expect(withFlag.triggered_by).toBe(MIT_TRIGGERED_BY_MERCHANT);
    expect(withFlag.payment_consent_id).toBe("cst_1");

    const noConsent = buildMitSubsequentConfirmPayload({
      customerId: "cus_1",
      paymentMethodId: "mtd_1",
      paymentMethodType: "card",
      paymentConsentId: "",
      requestId: "req_3",
    });
    expect(noConsent.triggered_by).toBe(MIT_TRIGGERED_BY_MERCHANT);
    expect(noConsent.payment_consent_id).toBeUndefined();
  });
});

describe("nextMitConfirmTriggeredByRetry", () => {
  it("retries without triggered_by after the 91917838 validation miss", () => {
    expect(
      nextMitConfirmTriggeredByRetry(
        "Airwallex payment_intents/confirm failed (400) [validation_error]: triggered_by should not be set",
        true
      )
    ).toBe(false);
  });

  it("retries with triggered_by when Airwallex requires it", () => {
    expect(
      nextMitConfirmTriggeredByRetry(
        "Airwallex payment_intents/confirm failed (400) [validation_error]: triggered_by is required",
        false
      )
    ).toBe(true);
  });

  it("does not retry unrelated confirm errors", () => {
    expect(
      nextMitConfirmTriggeredByRetry(
        "Airwallex payment_intents/confirm failed (400) [issuer_declined]: Insufficient funds",
        false
      )
    ).toBeNull();
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
        reason: "Airwallex payment_intents/confirm failed (400) [validation_error]: triggered_by should not be set",
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
        reason: "Missing recurring payment credentials (customer/payment_method/payment_consent)",
      })
    ).toBe("permanent");
  });
});
