import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const AIRWALLEX_SUCCESS_STATES = new Set([
  "SUCCEEDED",
  "SUCCESS",
  "PAID",
  "CAPTURE_REQUESTED",
  "SETTLED",
]);

type AirwallexLoginResponse = {
  token?: string;
  expires_at?: string;
  message?: string;
};

type AirwallexIntentResponse = {
  id?: string;
  status?: string;
  customer_id?: string;
  latest_payment_attempt?: {
    id?: string;
    status?: string;
  };
};

type PaymentOrderRow = {
  id: string;
  parent_id: string | null;
  mobile_number: string;
  merchant_order_id: string;
  status: string;
  final_amount_hkd: number;
  finalized_at: string | null;
  airwallex_customer_id: string | null;
  airwallex_payment_intent_id: string | null;
};

type AirwallexFailureDetails = {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
};

type AirwallexPaymentMethod = {
  id?: string;
  type?: string;
  customer_id?: string;
  card?: {
    brand?: string;
    last4?: string;
  };
  applepay?: {
    tokenized_card?: {
      brand?: string;
      last4?: string;
    };
  };
  googlepay?: {
    tokenized_card?: {
      brand?: string;
      last4?: string;
    };
  };
  [key: string]: unknown;
};

type AirwallexAttemptResponse = {
  id?: string;
  status?: string;
  customer_id?: string;
  payment_consent_id?: string;
  payment_method_transaction_id?: string;
  payment_method?: AirwallexPaymentMethod;
  failure_code?: string;
  failure_details?: AirwallexFailureDetails;
  provider_original_response_code?: string;
  provider_original_response_message?: string;
};

type PaymentDetailSnapshot = {
  customerId: string | null;
  paymentConsentId: string | null;
  paymentMethodId: string | null;
  paymentMethodType: string | null;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  paymentMethodLabel: string | null;
  paymentMethodTransactionId: string | null;
  paymentAttemptStatus: string | null;
  paymentFailureCode: string | null;
  paymentFailureMessage: string | null;
  paymentProviderResponseCode: string | null;
  paymentProviderResponseMessage: string | null;
};

export type VerifyFinalizeResult = {
  paid: boolean;
  order_id: string;
  mobile_number: string;
  already_finalized: boolean;
  status: string;
  payment_intent_id: string | null;
  payment_attempt_id: string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeMethodType(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

function normalizeCardBrand(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("master")) return "mastercard";
  if (normalized.includes("visa")) return "visa";
  return normalized;
}

function toPaymentMethodLabel(
  methodType: string | null,
  cardBrand: string | null
): string | null {
  if (!methodType) return null;
  if (methodType === "card") {
    if (cardBrand === "visa") return "visa";
    if (cardBrand === "mastercard") return "mastercard";
    return "card";
  }
  if (methodType === "applepay") return "apple pay";
  if (methodType === "googlepay") return "google pay";
  if (methodType === "alipayhk") return "alipay hk";
  if (methodType === "wechatpay") return "wechat pay hk";
  return methodType;
}

function addOneMonthIso(date: Date): string {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}

function extractAttemptObject(rawPayload: Record<string, unknown>): Record<string, unknown> | null {
  if (readObject(rawPayload.payment_method)) return rawPayload;
  const envelope = readObject(rawPayload.data);
  const object = readObject(envelope?.object);
  if (object && readObject(object.payment_method)) return object;
  return null;
}

function buildSnapshotFromAttempt(
  attempt: AirwallexAttemptResponse | null,
  intent: AirwallexIntentResponse | null
): PaymentDetailSnapshot {
  const method = attempt?.payment_method;
  const normalizedType = normalizeMethodType(readString(method?.type));
  const tokenizedBrand =
    readString(method?.applepay?.tokenized_card?.brand) ||
    readString(method?.googlepay?.tokenized_card?.brand) ||
    null;
  const cardBrand = normalizeCardBrand(
    readString(method?.card?.brand) || normalizeCardBrand(tokenizedBrand)
  );
  const cardLast4 =
    readString(method?.card?.last4) ||
    readString(method?.applepay?.tokenized_card?.last4) ||
    readString(method?.googlepay?.tokenized_card?.last4) ||
    null;

  const failureDetails = attempt?.failure_details || {};
  const nestedFailure = readObject(failureDetails.details);
  const failureMessage =
    readString(failureDetails.message) ||
    readString(nestedFailure?.original_response_message) ||
    null;
  const providerResponseMessage =
    readString(attempt?.provider_original_response_message) ||
    readString(nestedFailure?.original_response_message) ||
    null;
  const providerResponseCode =
    readString(attempt?.provider_original_response_code) ||
    readString(nestedFailure?.original_response_code) ||
    null;

  const customerId =
    readString(attempt?.customer_id) ||
    readString(method?.customer_id) ||
    readString(intent?.customer_id) ||
    null;

  return {
    customerId,
    paymentConsentId: readString(attempt?.payment_consent_id),
    paymentMethodId: readString(method?.id),
    paymentMethodType: normalizedType,
    paymentMethodBrand: cardBrand,
    paymentMethodLast4: cardLast4,
    paymentMethodLabel: toPaymentMethodLabel(normalizedType, cardBrand),
    paymentMethodTransactionId: readString(attempt?.payment_method_transaction_id),
    paymentAttemptStatus: readString(attempt?.status),
    paymentFailureCode:
      readString(attempt?.failure_code) || readString(failureDetails.code) || null,
    paymentFailureMessage: failureMessage,
    paymentProviderResponseCode: providerResponseCode,
    paymentProviderResponseMessage: providerResponseMessage,
  };
}

async function updateOrderPaymentDetails(
  supabaseAdmin: SupabaseClient,
  orderId: string,
  paymentAttemptId: string | null,
  snapshot: PaymentDetailSnapshot
) {
  const payload: Record<string, unknown> = {};
  if (paymentAttemptId) payload.airwallex_payment_attempt_id = paymentAttemptId;
  if (snapshot.customerId) payload.airwallex_customer_id = snapshot.customerId;
  if (snapshot.paymentConsentId) {
    payload.airwallex_payment_consent_id = snapshot.paymentConsentId;
  }
  if (snapshot.paymentMethodId) payload.airwallex_payment_method_id = snapshot.paymentMethodId;
  if (snapshot.paymentMethodType) payload.payment_method_type = snapshot.paymentMethodType;
  if (snapshot.paymentMethodBrand) payload.payment_method_brand = snapshot.paymentMethodBrand;
  if (snapshot.paymentMethodLast4) payload.payment_method_last4 = snapshot.paymentMethodLast4;
  if (snapshot.paymentMethodLabel) payload.payment_method_label = snapshot.paymentMethodLabel;
  if (snapshot.paymentMethodTransactionId) {
    payload.airwallex_payment_method_transaction_id = snapshot.paymentMethodTransactionId;
  }
  if (snapshot.paymentAttemptStatus) payload.payment_attempt_status = snapshot.paymentAttemptStatus;
  payload.payment_failure_code = snapshot.paymentFailureCode;
  payload.payment_failure_message = snapshot.paymentFailureMessage;
  payload.payment_provider_response_code = snapshot.paymentProviderResponseCode;
  payload.payment_provider_response_message = snapshot.paymentProviderResponseMessage;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabaseAdmin
    .from("parent_payment_orders")
    .update(payload)
    .eq("id", orderId);
  if (error) {
    throw error;
  }
}

async function upsertRecurringProfile(
  supabaseAdmin: SupabaseClient,
  order: PaymentOrderRow,
  snapshot: PaymentDetailSnapshot
) {
  if (!snapshot.customerId || !snapshot.paymentMethodId || !snapshot.paymentMethodType) {
    return;
  }
  const amount = Number(order.final_amount_hkd || 0);
  if (!(amount > 0)) return;

  const nowIso = new Date().toISOString();
  const nextChargeAt = addOneMonthIso(new Date());
  const { error } = await supabaseAdmin.from("parent_recurring_profiles").upsert(
    {
      parent_id: order.parent_id,
      mobile_number: order.mobile_number,
      status: "active",
      airwallex_customer_id: snapshot.customerId,
      airwallex_payment_consent_id: snapshot.paymentConsentId,
      airwallex_payment_method_id: snapshot.paymentMethodId,
      payment_method_type: snapshot.paymentMethodType,
      payment_method_brand: snapshot.paymentMethodBrand,
      payment_method_label: snapshot.paymentMethodLabel,
      recurring_amount_hkd: amount,
      currency: "HKD",
      next_charge_at: nextChargeAt,
      last_charged_at: nowIso,
      last_order_id: order.id,
      last_order_status: "paid",
      last_error: null,
      updated_at: nowIso,
    },
    { onConflict: "mobile_number" }
  );
  if (error) {
    throw error;
  }
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

export function getAirwallexBaseUrl(): string {
  const explicit = process.env.AIRWALLEX_BASE_URL?.trim();
  if (explicit) {
    const normalized = explicit.toLowerCase();
    if (normalized === "prod" || normalized === "production" || normalized === "live") {
      return "https://api.airwallex.com";
    }
    if (normalized === "demo" || normalized === "sandbox" || normalized === "test") {
      return "https://api-demo.airwallex.com";
    }
    if (normalized === "api.airwallex.com") {
      return "https://api.airwallex.com";
    }
    if (normalized === "api-demo.airwallex.com") {
      return "https://api-demo.airwallex.com";
    }
    if (explicit.startsWith("http://") || explicit.startsWith("https://")) {
      return explicit.replace(/\/$/, "");
    }
    return `https://${explicit.replace(/\/$/, "")}`;
  }
  const env = process.env.AIRWALLEX_ENV?.trim().toLowerCase();
  if (env === "prod" || env === "production") {
    return "https://api.airwallex.com";
  }
  return "https://api-demo.airwallex.com";
}

export function hasAirwallexApiCredentials(): boolean {
  return Boolean(
    process.env.AIRWALLEX_CLIENT_ID?.trim() &&
    process.env.AIRWALLEX_API_KEY?.trim()
  );
}

export async function getAirwallexAccessToken(baseUrl: string): Promise<string> {
  const clientId = process.env.AIRWALLEX_CLIENT_ID?.trim() || "";
  const apiKey = process.env.AIRWALLEX_API_KEY?.trim() || "";
  const loginAs = process.env.AIRWALLEX_ACCOUNT_ID?.trim();

  if (!clientId || !apiKey) {
    throw new Error("Missing AIRWALLEX_CLIENT_ID or AIRWALLEX_API_KEY");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": clientId,
    "x-api-key": apiKey,
  };
  if (loginAs) headers["x-login-as"] = loginAs;

  const resp = await fetch(`${baseUrl}/api/v1/authentication/login`, {
    method: "POST",
    headers,
    cache: "no-store",
  });

  const data = (await resp.json()) as AirwallexLoginResponse;
  if (!resp.ok || !data.token) {
    throw new Error(data.message || "Airwallex authentication failed");
  }
  return data.token;
}

export async function getAirwallexPaymentAttempt({
  baseUrl,
  accessToken,
  paymentAttemptId,
}: {
  baseUrl: string;
  accessToken: string;
  paymentAttemptId: string;
}): Promise<AirwallexAttemptResponse> {
  const resp = await fetch(
    `${baseUrl}/api/v1/pa/payment_attempts/${encodeURIComponent(paymentAttemptId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );
  const payload = (await resp.json()) as AirwallexAttemptResponse;
  if (!resp.ok) {
    throw new Error("Unable to retrieve payment attempt from Airwallex");
  }
  return payload;
}

async function getOrderByReference(
  supabaseAdmin: SupabaseClient,
  paymentIntentId: string | null,
  merchantOrderId: string | null
): Promise<PaymentOrderRow | null> {
  if (paymentIntentId) {
    const { data, error } = await supabaseAdmin
      .from("parent_payment_orders")
      .select(
        "id,parent_id,mobile_number,merchant_order_id,status,finalized_at,final_amount_hkd,airwallex_customer_id,airwallex_payment_intent_id"
      )
      .eq("airwallex_payment_intent_id", paymentIntentId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data && data[0]) return data[0] as PaymentOrderRow;
  }

  if (merchantOrderId) {
    const { data, error } = await supabaseAdmin
      .from("parent_payment_orders")
      .select(
        "id,parent_id,mobile_number,merchant_order_id,status,finalized_at,final_amount_hkd,airwallex_customer_id,airwallex_payment_intent_id"
      )
      .eq("merchant_order_id", merchantOrderId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data && data[0]) return data[0] as PaymentOrderRow;
  }

  return null;
}

export async function verifyAndFinalizeParentPayment({
  supabaseAdmin,
  paymentIntentId,
  merchantOrderId,
}: {
  supabaseAdmin: SupabaseClient;
  paymentIntentId?: string | null;
  merchantOrderId?: string | null;
}): Promise<VerifyFinalizeResult> {
  const normalizedIntentId = paymentIntentId?.trim() || null;
  const normalizedOrderId = merchantOrderId?.trim() || null;
  const order = await getOrderByReference(
    supabaseAdmin,
    normalizedIntentId,
    normalizedOrderId
  );
  if (!order) {
    throw new Error("Payment order not found");
  }

  if (order.finalized_at) {
    return {
      paid: order.status === "paid",
      order_id: order.id,
      mobile_number: order.mobile_number,
      already_finalized: true,
      status: order.status,
      payment_intent_id: order.airwallex_payment_intent_id,
      payment_attempt_id: null,
    };
  }

  const intentId = normalizedIntentId || order.airwallex_payment_intent_id;
  if (!intentId) {
    throw new Error("Payment intent reference missing");
  }
  if (!hasAirwallexApiCredentials()) {
    throw new Error("Airwallex credentials not configured");
  }

  const baseUrl = getAirwallexBaseUrl();
  const accessToken = await getAirwallexAccessToken(baseUrl);
  const intentRes = await fetch(
    `${baseUrl}/api/v1/pa/payment_intents/${encodeURIComponent(intentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const intent = (await intentRes.json()) as AirwallexIntentResponse;
  if (!intentRes.ok) {
    throw new Error("Unable to retrieve payment intent from Airwallex");
  }

  const normalizedStatus = String(intent.status || "").toUpperCase();
  const latestStatus = String(
    intent.latest_payment_attempt?.status || ""
  ).toUpperCase();
  const isPaid =
    AIRWALLEX_SUCCESS_STATES.has(normalizedStatus) ||
    AIRWALLEX_SUCCESS_STATES.has(latestStatus);

  const { data: finalizeData, error: finalizeErr } = await supabaseAdmin.rpc(
    "finalize_parent_payment",
    {
      p_order_id: order.id,
      p_payment_intent_id: intentId,
      p_payment_attempt_id: intent.latest_payment_attempt?.id ?? null,
      p_paid: isPaid,
      p_raw_response: intent as unknown as Record<string, unknown>,
    }
  );
  if (finalizeErr) {
    throw finalizeErr;
  }

  const paymentAttemptId = intent.latest_payment_attempt?.id?.trim() || null;
  try {
    let attempt: AirwallexAttemptResponse | null = null;
    if (paymentAttemptId) {
      attempt = await getAirwallexPaymentAttempt({
        baseUrl,
        accessToken,
        paymentAttemptId,
      });
    }
    const snapshot = buildSnapshotFromAttempt(attempt, intent);
    await updateOrderPaymentDetails(
      supabaseAdmin,
      order.id,
      paymentAttemptId,
      snapshot
    );
    if (isPaid) {
      await upsertRecurringProfile(supabaseAdmin, order, snapshot);
    }
  } catch {
    // Payment status finalization should not fail because of metadata enrichment.
  }

  const finalizePayload = (finalizeData as { already_finalized?: boolean; status?: string } | null) ?? {};
  return {
    paid: (finalizePayload.status || (isPaid ? "paid" : "failed")) === "paid",
    order_id: order.id,
    mobile_number: order.mobile_number,
    already_finalized: Boolean(finalizePayload.already_finalized),
    status: finalizePayload.status || (isPaid ? "paid" : "failed"),
    payment_intent_id: intentId,
    payment_attempt_id: paymentAttemptId,
  };
}

export type FinalizeByIntentResult = {
  ok: boolean;
  alreadyFinalized: boolean;
  orderId: string | null;
  error?: string;
  statusCode?: number;
};

export async function finalizePaymentByIntent({
  supabaseAdmin,
  paymentIntentId,
  paid,
  paymentAttemptId,
  rawPayload,
  merchantOrderId,
}: {
  supabaseAdmin: SupabaseClient;
  paymentIntentId: string;
  paid: boolean;
  paymentAttemptId?: string | null;
  rawPayload: Record<string, unknown>;
  merchantOrderId?: string | null;
}): Promise<FinalizeByIntentResult> {
  const order = await getOrderByReference(
    supabaseAdmin,
    paymentIntentId || null,
    merchantOrderId || null
  );
  if (!order) {
    return { ok: false, alreadyFinalized: false, orderId: null, error: "Payment order not found", statusCode: 404 };
  }
  const orderId = order.id;

  const { data: finalizeData, error: finalizeErr } = await supabaseAdmin.rpc(
    "finalize_parent_payment",
    {
      p_order_id: orderId,
      p_payment_intent_id: paymentIntentId,
      p_payment_attempt_id: paymentAttemptId ?? null,
      p_paid: paid,
      p_raw_response: rawPayload,
    }
  );

  if (finalizeErr) {
    return {
      ok: false,
      alreadyFinalized: false,
      orderId,
      error: finalizeErr.message,
      statusCode: 500,
    };
  }

  const payload = (finalizeData as { already_finalized?: boolean } | null) ?? {};
  try {
    const nestedAttempt = extractAttemptObject(rawPayload) as AirwallexAttemptResponse | null;
    let attempt: AirwallexAttemptResponse | null = nestedAttempt;
    const normalizedAttemptId =
      readString(paymentAttemptId) || readString(nestedAttempt?.id) || null;
    if (!attempt && normalizedAttemptId && hasAirwallexApiCredentials()) {
      const baseUrl = getAirwallexBaseUrl();
      const accessToken = await getAirwallexAccessToken(baseUrl);
      attempt = await getAirwallexPaymentAttempt({
        baseUrl,
        accessToken,
        paymentAttemptId: normalizedAttemptId,
      });
    }
    const snapshot = buildSnapshotFromAttempt(attempt, null);
    await updateOrderPaymentDetails(
      supabaseAdmin,
      orderId,
      normalizedAttemptId,
      snapshot
    );
    if (paid) {
      await upsertRecurringProfile(supabaseAdmin, order, snapshot);
    }
  } catch {
    // Keep webhook/verify finalization successful even if enrichment fails.
  }

  return {
    ok: true,
    alreadyFinalized: Boolean(payload.already_finalized),
    orderId,
  };
}
