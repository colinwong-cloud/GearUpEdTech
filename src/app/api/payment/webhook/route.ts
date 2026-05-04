import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { finalizePaymentByIntent } from "@/lib/server/payment-finalize";

type AirwallexWebhookEnvelope = {
  id?: string;
  name?: string;
  data?: {
    object?: {
      id?: string;
      status?: string;
      latest_payment_attempt?: { id?: string; status?: string };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const SUCCESS_STATES = new Set(["SUCCEEDED", "SUCCESS", "PAID"]);

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.trim();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role env missing" },
      { status: 503 }
    );
  }

  const rawBody = await req.text();
  let event: AirwallexWebhookEnvelope;
  try {
    event = JSON.parse(rawBody) as AirwallexWebhookEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const signature = req.headers.get("x-signature") || "";
  const secret = process.env.AIRWALLEX_WEBHOOK_SECRET?.trim() || "";
  if (secret) {
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  }

  const eventId = event.id?.trim() || "";
  const eventType = event.name?.trim() || "unknown";
  const object = event.data?.object || {};
  const paymentIntentId = String(object.id || "").trim();
  const paymentStatus = String(object.status || "").toUpperCase();
  const attemptId = String(object.latest_payment_attempt?.id || "").trim();
  const isPaid = SUCCESS_STATES.has(paymentStatus);

  if (!eventId || !paymentIntentId) {
    return NextResponse.json(
      { error: "Missing webhook event id or payment intent id" },
      { status: 400 }
    );
  }

  // First insert guards webhook idempotency by unique event_id.
  const { data: insertedEvents, error: insertErr } = await supabaseAdmin
    .from("airwallex_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      payment_intent_id: paymentIntentId,
      status: "received",
      payload: event as unknown as Record<string, unknown>,
    })
    .select("id")
    .limit(1);

  if (insertErr) {
    const message = String(insertErr.message || "");
    if (/duplicate key|unique/i.test(message)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const webhookEventId = insertedEvents?.[0]?.id as string | undefined;

  const finalized = await finalizePaymentByIntent({
    supabaseAdmin,
    paymentIntentId,
    paid: isPaid,
    paymentAttemptId: attemptId || null,
    rawPayload: event as unknown as Record<string, unknown>,
  });

  if (webhookEventId) {
    await supabaseAdmin
      .from("airwallex_webhook_events")
      .update({
        status: finalized.ok ? "processed" : "failed",
        order_id: finalized.orderId ?? null,
        processed_at: new Date().toISOString(),
        error_message: finalized.ok ? null : finalized.error ?? "Finalize failed",
      })
      .eq("id", webhookEventId);
  }

  if (!finalized.ok) {
    return NextResponse.json(
      { error: finalized.error || "Failed to finalize webhook payment" },
      { status: finalized.statusCode ?? 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    paid: isPaid,
    already_finalized: finalized.alreadyFinalized,
  });
}
