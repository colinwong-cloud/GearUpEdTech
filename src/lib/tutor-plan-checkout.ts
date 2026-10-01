import { TUTOR_PLAN_PRICE_HKD } from "@/lib/tutor-billing";

export async function redirectToTutorPlanCheckout(): Promise<void> {
  const res = await fetch("/api/tutor/billing/checkout", { method: "POST" });
  const payload = (await res.json().catch(() => null)) as
    | {
        intent_id?: string;
        client_secret?: string;
        customer_id?: string;
        final_amount_hkd?: number;
        error?: string;
      }
    | null;
  if (!res.ok || !payload?.intent_id || !payload.client_secret || !payload.customer_id) {
    throw new Error(payload?.error || "未能建立付款。");
  }
  const params = new URLSearchParams({
    intent_id: payload.intent_id,
    client_secret: payload.client_secret,
    customer_id: payload.customer_id,
    final_amount_hkd: String(payload.final_amount_hkd ?? TUTOR_PLAN_PRICE_HKD),
    currency: "HKD",
    country_code: "HK",
    payment_method: "all",
    airwallex_locale: "zh-HK",
    payer: "tutor",
  });
  window.location.href = `/payment-airwallex?${params.toString()}`;
}
