import { describe, expect, it } from "vitest";
import {
  HPP_MIT_POLICY_VERSION,
  buildApplePaySubscribeRequestOptions,
  buildMitHppRedirectProps,
  buildMitPaymentConsentOptions,
  nextMonthlyRecurringStartDate,
} from "./airwallex-hpp-mit";

describe("airwallex-hpp-mit", () => {
  it("builds merchant-scheduled payment_consent for HPP", () => {
    const consent = buildMitPaymentConsentOptions({
      payment_amount_type: "FIXED",
      fixed_payment_amount: 9.9,
      payment_currency: "HKD",
      payment_schedule: { period: 1, period_unit: "MONTH" },
    });
    expect(consent.next_triggered_by).toBe("merchant");
    expect(consent.merchant_trigger_reason).toBe("scheduled");
    expect(consent.terms_of_use?.fixed_payment_amount).toBe(9.9);
  });

  it("requires customer_id and includes mode recurring + payment_consent", () => {
    const props = buildMitHppRedirectProps({
      intentId: "int_1",
      clientSecret: "secret_1",
      currency: "HKD",
      countryCode: "HK",
      customerId: "cus_1",
      methods: ["card", "applepay", "googlepay"],
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/cancel",
      termsOfUse: {
        payment_amount_type: "FIXED",
        fixed_payment_amount: 9.9,
        payment_currency: "HKD",
        payment_schedule: { period: 1, period_unit: "MONTH" },
      },
    });
    expect(HPP_MIT_POLICY_VERSION).toContain("hpp-mit");
    expect(props.mode).toBe("recurring");
    expect(props.customer_id).toBe("cus_1");
    expect(props.submitType).toBe("subscribe");
    expect(props.payment_consent).toEqual({
      next_triggered_by: "merchant",
      merchant_trigger_reason: "scheduled",
      terms_of_use: {
        payment_amount_type: "FIXED",
        fixed_payment_amount: 9.9,
        payment_currency: "HKD",
        payment_schedule: { period: 1, period_unit: "MONTH" },
      },
    });
  });

  it("starts the Apple Pay subscription one month after today's charge", () => {
    const now = new Date("2026-10-02T08:30:00.000Z");
    const start = nextMonthlyRecurringStartDate(now);
    expect(start.toISOString()).toBe("2026-11-02T08:30:00.000Z");
    const options = buildApplePaySubscribeRequestOptions({
      countryCode: "HK",
      amount: 199,
      now,
    });
    const lineItems = options.lineItems as Array<Record<string, unknown>>;
    expect(lineItems[0]).toMatchObject({
      amount: "199.00",
      paymentTiming: "recurring",
      recurringPaymentIntervalUnit: "month",
      recurringPaymentIntervalCount: 1,
      recurringPaymentStartDate: start,
    });
    expect(start.getTime()).toBeGreaterThan(now.getTime());
  });

  it("throws when customer_id is missing", () => {
    expect(() =>
      buildMitHppRedirectProps({
        intentId: "int_1",
        clientSecret: "secret_1",
        currency: "HKD",
        countryCode: "HK",
        customerId: "  ",
        methods: ["card"],
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      })
    ).toThrow(/customer_id/i);
  });
});
