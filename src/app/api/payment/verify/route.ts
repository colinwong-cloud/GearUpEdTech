import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  finalizePaymentByIntent,
  getAirwallexBaseUrl,
} from "@/lib/server/payment-finalize";

type AirwallexLoginResponse = {
  token?: string;
  expires_at?: string;
};

type AirwallexIntentResponse = {
  id?: string;
  status?: string;
  latest_payment_attempt?: {
    status?: string;
    id?: string;
  };
  amount?: number;
  currency?: string;
};

const AIRWALLEX_SUCCESS_STATES = new Set([
  "SUCCEEDED",
  "SUCCESS",
  "PAID",
]);

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

async function getAirwallexAccessToken(baseUrl: string): Promise<string> {
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
    throw new Error("Airwallex authentication failed");
  }
  return data.token;
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role env missing" },
      { status: 503 }
    );
  }

  let body: { payment_intent_id?: string };
  try {
    body = (await req.json()) as { payment_intent_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paymentIntentId = body.payment_intent_id?.trim() || "";
  if (!paymentIntentId) {
    return NextResponse.json(
      { error: "Missing payment_intent_id" },
      { status: 400 }
    );
  }

  try {
    const baseUrl = getAirwallexBaseUrl();
    const accessToken = await getAirwallexAccessToken(baseUrl);
    const intentRes = await fetch(
      `${baseUrl}/api/v1/pa/payment_intents/${encodeURIComponent(paymentIntentId)}`,
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
      return NextResponse.json(
        { error: "Unable to retrieve payment intent from Airwallex" },
        { status: 502 }
      );
    }

    const normalizedStatus = String(intent.status || "").toUpperCase();
    const latestStatus = String(
      intent.latest_payment_attempt?.status || ""
    ).toUpperCase();
    const isPaid =
      AIRWALLEX_SUCCESS_STATES.has(normalizedStatus) ||
      AIRWALLEX_SUCCESS_STATES.has(latestStatus);
    const finalized = await finalizePaymentByIntent({
      supabaseAdmin,
      paymentIntentId,
      paid: isPaid,
      paymentAttemptId: intent.latest_payment_attempt?.id || null,
      rawPayload: intent as unknown as Record<string, unknown>,
    });
    if (!finalized.ok) {
      return NextResponse.json(
        { error: finalized.error || "Payment order not found" },
        { status: finalized.statusCode ?? 500 }
      );
    }

    // Consent readiness is independent of browser/OS; surface it after every paid verify.
    let consentCaptured = false;
    let recurringLinkageReady = false;
    let paymentMethodType: string | null = null;
    if (finalized.orderId) {
      const { data: orderRow } = await supabaseAdmin
        .from("parent_payment_orders")
        .select("mobile_number,airwallex_payment_consent_id,airwallex_payment_method_id,payment_method_type")
        .eq("id", finalized.orderId)
        .maybeSingle();
      const mobile = String(orderRow?.mobile_number || "").trim();
      paymentMethodType =
        orderRow?.payment_method_type == null
          ? null
          : String(orderRow.payment_method_type).trim() || null;
      if (mobile) {
        const { data: profile } = await supabaseAdmin
          .from("parent_recurring_profiles")
          .select(
            "airwallex_payment_consent_id,airwallex_payment_method_id,payment_method_type,status"
          )
          .eq("mobile_number", mobile)
          .maybeSingle();
        consentCaptured = Boolean(profile?.airwallex_payment_consent_id);
        recurringLinkageReady = Boolean(
          profile?.airwallex_payment_consent_id &&
            profile?.airwallex_payment_method_id &&
            profile?.payment_method_type
        );
      }
      // Fallback to order-level linkage if profile row is still catching up.
      if (!consentCaptured) {
        consentCaptured = Boolean(orderRow?.airwallex_payment_consent_id);
      }
      if (!recurringLinkageReady) {
        recurringLinkageReady = Boolean(
          orderRow?.airwallex_payment_consent_id &&
            orderRow?.airwallex_payment_method_id &&
            orderRow?.payment_method_type
        );
      }
    }

    if (isPaid && !recurringLinkageReady) {
      console.error(
        "[anti-missing][payment][mit-policy] postpay-consent-not-ready",
        JSON.stringify({
          payment_intent_id: paymentIntentId,
          order_id: finalized.orderId,
          payment_method_type: paymentMethodType,
          consent_captured: consentCaptured,
          recurring_linkage_ready: recurringLinkageReady,
        })
      );
    }

    return NextResponse.json({
      paid: isPaid,
      status: normalizedStatus || latestStatus || "UNKNOWN",
      already_finalized: finalized.alreadyFinalized,
      consent_captured: consentCaptured,
      recurring_linkage_ready: recurringLinkageReady,
      payment_method_type: paymentMethodType,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to verify payment status",
      },
      { status: 500 }
    );
  }
}
