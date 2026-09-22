export type MitSubsequentConfirmInput = {
  customerId: string;
  paymentMethodId: string;
  paymentMethodType: string;
  paymentConsentId: string;
  requestId: string;
  metadata?: Record<string, string>;
};

export type RecurringFailureKind = "permanent" | "retryable";

export const MIT_TRIGGERED_BY_MERCHANT = "merchant" as const;

const PERMANENT_ERROR_RE =
  /issuer_declined|card_expired|authentication_declined|risk_declined|payment_method_not_allowed|card_brand_not_supported|consent is disabled|consent_disabled|status=DISABLED|consent is not usable|missing recurring payment credentials|recurring amount is invalid/i;

export function buildMitSubsequentConfirmPayload(
  input: MitSubsequentConfirmInput,
  options?: { includeTriggeredBy?: boolean }
): Record<string, unknown> {
  const hasConsent = Boolean(String(input.paymentConsentId || "").trim());
  const includeTriggeredBy = options?.includeTriggeredBy ?? !hasConsent;
  const payload: Record<string, unknown> = {
    customer_id: input.customerId,
    payment_method: {
      id: input.paymentMethodId,
      type: input.paymentMethodType,
    },
    request_id: input.requestId,
    metadata: {
      merchant_trigger_reason: "scheduled",
      charge_type: "monthly_recurring",
      ...(input.metadata || {}),
    },
  };
  if (hasConsent) {
    payload.payment_consent_id = input.paymentConsentId;
  }
  if (includeTriggeredBy) {
    payload.triggered_by = MIT_TRIGGERED_BY_MERCHANT;
  }
  return payload;
}

export function nextMitConfirmTriggeredByRetry(
  reason: string,
  usedTriggeredBy: boolean
): boolean | null {
  if (/triggered_by should not be set/i.test(reason) && usedTriggeredBy) {
    return false;
  }
  if (/triggered_by is required/i.test(reason) && !usedTriggeredBy) {
    return true;
  }
  return null;
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
