/**
 * Hosted Payment Page (HPP) props required for merchant-scheduled MIT consent.
 * Server-side PaymentIntent.payment_consent alone is not enough — redirectToCheckout
 * must also pass mode/customer_id/payment_consent per Airwallex docs.
 */

export const HPP_MIT_POLICY_VERSION = "hpp-mit-consent-fields-v1";

export type MitRecurringTermsOfUse = {
  payment_amount_type: "FIXED";
  fixed_payment_amount: number;
  payment_currency: "HKD";
  payment_schedule: {
    period: number;
    period_unit: "MONTH";
  };
  billing_cycle_charge_day?: number;
  total_billing_cycles?: number | null;
};

export type MitPaymentConsentOptions = {
  next_triggered_by: "merchant";
  merchant_trigger_reason: "scheduled";
  terms_of_use?: MitRecurringTermsOfUse;
};

/**
 * Next Apple Pay subscription date. Today's charge is the PaymentIntent total.
 * The recurring line must start on the following month, or Apple Pay treats
 * both as the same charge and rejects the request.
 */
export function nextMonthlyRecurringStartDate(now = new Date()): Date {
  const next = new Date(now.getTime());
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export function buildApplePaySubscribeRequestOptions(input: {
  countryCode: string;
  amount: number;
  now?: Date;
}): Record<string, unknown> {
  const amount = Number.isFinite(input.amount) ? Math.max(input.amount, 0) : 0;
  return {
    buttonType: "subscribe",
    existingPaymentMethodRequired: false,
    countryCode: input.countryCode,
    totalPriceLabel: "GearUp 增分寶",
    lineItems: [
      {
        label: "GearUp 增分寶月費會員",
        amount: amount.toFixed(2),
        type: "final",
        paymentTiming: "recurring",
        recurringPaymentStartDate: nextMonthlyRecurringStartDate(input.now),
        recurringPaymentIntervalUnit: "month",
        recurringPaymentIntervalCount: 1,
      },
    ],
  };
}

export function buildMitPaymentConsentOptions(
  termsOfUse?: MitRecurringTermsOfUse | null
): MitPaymentConsentOptions {
  const paymentConsent: MitPaymentConsentOptions = {
    next_triggered_by: "merchant",
    merchant_trigger_reason: "scheduled",
  };
  if (termsOfUse) {
    paymentConsent.terms_of_use = termsOfUse;
  }
  return paymentConsent;
}

export function buildMitHppRedirectProps(input: {
  intentId: string;
  clientSecret: string;
  currency: string;
  countryCode: string;
  locale?: string;
  customerId: string;
  methods: string[];
  successUrl: string;
  cancelUrl: string;
  termsOfUse?: MitRecurringTermsOfUse | null;
  applePayRequestOptions?: Record<string, unknown>;
}): Record<string, unknown> {
  const customerId = String(input.customerId || "").trim();
  if (!customerId) {
    throw new Error("MIT checkout requires airwallex customer_id.");
  }
  const intentId = String(input.intentId || "").trim();
  const clientSecret = String(input.clientSecret || "").trim();
  if (!intentId || !clientSecret) {
    throw new Error("MIT checkout requires intent_id and client_secret.");
  }

  const props: Record<string, unknown> = {
    intent_id: intentId,
    client_secret: clientSecret,
    currency: input.currency,
    country_code: input.countryCode,
    locale: input.locale || "zh-HK",
    mode: "recurring",
    customer_id: customerId,
    submitType: "subscribe",
    methods: input.methods,
    payment_consent: buildMitPaymentConsentOptions(input.termsOfUse),
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  };
  if (input.applePayRequestOptions) {
    props.applePayRequestOptions = input.applePayRequestOptions;
  }
  return props;
}
