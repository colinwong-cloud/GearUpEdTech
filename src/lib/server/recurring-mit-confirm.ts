export type MitSubsequentConfirmInput = {
  customerId: string;
  paymentMethodId: string;
  paymentMethodType: string;
  paymentConsentId: string;
  requestId: string;
  metadata?: Record<string, string>;
};

export type RecurringFailureKind = "permanent" | "retryable";

const PERMANENT_ERROR_RE =
  /issuer_declined|card_expired|authentication_declined|risk_declined|payment_method_not_allowed|card_brand_not_supported|consent is disabled|consent_disabled|status=DISABLED|consent is not usable|missing recurring payment credentials|recurring amount is invalid/i;

export function buildMitSubsequentConfirmPayload(
  input: MitSubsequentConfirmInput
): Record<string, unknown> {
  return {
    customer_id: input.customerId,
    payment_method: {
      id: input.paymentMethodId,
      type: input.paymentMethodType,
    },
    payment_consent_id: input.paymentConsentId,
    triggered_by: "merchant",
    request_id: input.requestId,
    metadata: {
      merchant_trigger_reason: "scheduled",
      charge_type: "monthly_recurring",
      ...(input.metadata || {}),
    },
  };
}

export function isConsentUsableForMit(status: string | null | undefined): boolean {
  return String(status || "").trim().toUpperCase() === "VERIFIED";
}

export function isConsentPermanentlyUnusable(status: string | null | undefined): boolean {
  return String(status || "").trim().toUpperCase() === "DISABLED";
}

export function classifyRecurringChargeFailure({
  reason,
  consentStatus,
}: {
  reason: string;
  httpStatus?: number | null;
  consentStatus?: string | null;
}): RecurringFailureKind {
  if (isConsentPermanentlyUnusable(consentStatus)) return "permanent";
  if (PERMANENT_ERROR_RE.test(reason)) return "permanent";
  return "retryable";
}
