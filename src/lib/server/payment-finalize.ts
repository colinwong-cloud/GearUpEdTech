import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const AIRWALLEX_SUCCESS_STATES = new Set([
  "SUCCEEDED",
  "SUCCESS",
  "PAID",
]);

type AirwallexLoginResponse = {
  token?: string;
  expires_at?: string;
  message?: string;
};

type AirwallexIntentResponse = {
  id?: string;
  status?: string;
  latest_payment_attempt?: {
    id?: string;
    status?: string;
  };
};

type PaymentOrderRow = {
  id: string;
  mobile_number: string;
  merchant_order_id: string;
  status: string;
  finalized_at: string | null;
  airwallex_payment_intent_id: string | null;
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
  if (explicit) return explicit;
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

async function getOrderByReference(
  supabaseAdmin: SupabaseClient,
  paymentIntentId: string | null,
  merchantOrderId: string | null
): Promise<PaymentOrderRow | null> {
  if (paymentIntentId) {
    const { data, error } = await supabaseAdmin
      .from("parent_payment_orders")
      .select(
        "id,mobile_number,merchant_order_id,status,finalized_at,airwallex_payment_intent_id"
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
        "id,mobile_number,merchant_order_id,status,finalized_at,airwallex_payment_intent_id"
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

  const finalizePayload = (finalizeData as { already_finalized?: boolean; status?: string } | null) ?? {};
  return {
    paid: (finalizePayload.status || (isPaid ? "paid" : "failed")) === "paid",
    order_id: order.id,
    mobile_number: order.mobile_number,
    already_finalized: Boolean(finalizePayload.already_finalized),
    status: finalizePayload.status || (isPaid ? "paid" : "failed"),
    payment_intent_id: intentId,
    payment_attempt_id: intent.latest_payment_attempt?.id ?? null,
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
  return {
    ok: true,
    alreadyFinalized: Boolean(payload.already_finalized),
    orderId,
  };
}
