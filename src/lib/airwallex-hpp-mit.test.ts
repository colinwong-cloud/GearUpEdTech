import { describe, expect, it } from "vitest";
import {
  HPP_MIT_POLICY_VERSION,
  buildApplePaySubscribeRequestOptions,
  buildMitHppRedirectProps,
  buildMitPaymentConsentOptions,
  nextMonthlyRecurringStartDate,
  parseTutorCheckoutTerms,
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

  it("keeps the Apple Pay line equal to today's charge and free of Date fields", () => {
    const now = new Date("2026-10-02T08:30:00.000Z");
    expect(nextMonthlyRecurringStartDate(now).toISOString()).toBe("2026-11-02T08:30:00.000Z");
    const options = buildApplePaySubscribeRequestOptions({
      countryCode: "HK",
      amount: 199,
    });
    const lineItems = options.lineItems as Array<Record<string, unknown>>;
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0]).toEqual({
      label: "GearUp monthly plan",
      amount: "199.00",
      type: "final",
      paymentTiming: "recurring",
      recurringPaymentIntervalUnit: "month",
      recurringPaymentIntervalCount: 1,
    });
    expect(JSON.stringify(options)).not.toContain("recurringPaymentStartDate");
    expect(JSON.stringify(options)).not.toMatch(/[^\x00-\x7F]/);
  });

  it("keeps the tutor consent terms that were saved on the payment intent", () => {
    const raw = JSON.stringify({
      payment_amount_type: "FIXED",
      fixed_payment_amount: 199,
      payment_currency: "HKD",
      payment_schedule: { period: 1, period_unit: "MONTH" },
      billing_cycle_charge_day: 3,
      total_billing_cycles: null,
    });
    expect(parseTutorCheckoutTerms(raw)).toMatchObject({
      fixed_payment_amount: 199,
      billing_cycle_charge_day: 3,
      total_billing_cycles: null,
    });
    expect(parseTutorCheckoutTerms('{"payment_amount_type":"FIXED"}')).toBeNull();
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
