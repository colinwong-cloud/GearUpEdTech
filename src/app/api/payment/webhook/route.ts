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
      payment_intent_id?: string;
      latest_payment_attempt?: { id?: string; status?: string };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const SUCCESS_STATES = new Set([
  "SUCCEEDED",
  "SUCCESS",
  "PAID",
  "CAPTURE_REQUESTED",
  "SETTLED",
]);

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeRefundStatus(value: string | null): string {
  const normalized = (value || "").trim().toUpperCase();
  if (!normalized) return "received";
  return normalized.toLowerCase();
}

function isMissingRefundTableError(message: string): boolean {
  return /parent_payment_refunds|42P01|does not exist/i.test(message);
}

function extractMerchantOrderId(object: Record<string, unknown>): string | null {
  const direct = readString(object.merchant_order_id) || readString(object.reference);
  if (direct) return direct;

  const metadata =
    object.metadata && typeof object.metadata === "object"
      ? (object.metadata as Record<string, unknown>)
      : null;
  const fromMetadata =
    (metadata && readString(metadata.merchant_order_id)) ||
    (metadata && readString(metadata.order_id)) ||
    null;
  if (fromMetadata) return fromMetadata;

  const order =
    object.order && typeof object.order === "object"
      ? (object.order as Record<string, unknown>)
      : null;
  return (
    (order && readString(order.merchant_order_id)) ||
    (order && readString(order.reference)) ||
    null
  );
}

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
  const isAttemptEvent = eventType.startsWith("payment_attempt.");
  const isRefundEvent = eventType.startsWith("refund.");
  const paymentIntentId = String(
    isAttemptEvent || isRefundEvent
      ? object.payment_intent_id || ""
      : object.id || ""
  ).trim();
  const merchantOrderId = extractMerchantOrderId(object as Record<string, unknown>);
  const paymentStatus = String(object.status || "").toUpperCase();
  const attemptId = String(
    isAttemptEvent ? object.id || "" : object.latest_payment_attempt?.id || ""
  ).trim();
  const refundId = isRefundEvent ? String(object.id || "").trim() : "";
  const refundRequestId = isRefundEvent ? readString(object.request_id) : null;
  const isPaid = SUCCESS_STATES.has(paymentStatus);

  if (!eventId || (!paymentIntentId && !isRefundEvent)) {
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
      payment_intent_id: paymentIntentId || null,
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

  if (isRefundEvent) {
    try {
      const failure = readObject(object.failure_details);
      const failureCode =
        readString(failure?.code) || readString((failure?.details as Record<string, unknown> | undefined)?.original_response_code);
      const failureMessage =
        readString(failure?.message) ||
        readString((failure?.details as Record<string, unknown> | undefined)?.original_response_message);
      const updatePayload = {
        status: normalizeRefundStatus(readString(object.status)),
        failure_code: failureCode,
        failure_message: failureMessage,
        raw_response: object as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      };

      let matched = false;
      if (refundId) {
        const byRefundId = await supabaseAdmin
          .from("parent_payment_refunds")
          .update(updatePayload)
          .eq("airwallex_refund_id", refundId)
          .select("id")
          .limit(1);
        if (byRefundId.error && !isMissingRefundTableError(byRefundId.error.message)) {
          throw byRefundId.error;
        }
        matched = (byRefundId.data?.length ?? 0) > 0;
      }

      if (!matched && refundRequestId) {
        const byRequestId = await supabaseAdmin
          .from("parent_payment_refunds")
          .update({
            ...updatePayload,
            airwallex_refund_id: refundId || null,
          })
          .eq("airwallex_request_id", refundRequestId)
          .select("id")
          .limit(1);
        if (byRequestId.error && !isMissingRefundTableError(byRequestId.error.message)) {
          throw byRequestId.error;
        }
      }

      if (webhookEventId) {
        await supabaseAdmin
          .from("airwallex_webhook_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", webhookEventId);
      }
      return NextResponse.json({ ok: true, refund: true });
    } catch (refundErr) {
      if (webhookEventId) {
        await supabaseAdmin
          .from("airwallex_webhook_events")
          .update({
            status: "failed",
            processed_at: new Date().toISOString(),
            error_message: refundErr instanceof Error ? refundErr.message : "Refund webhook update failed",
          })
          .eq("id", webhookEventId);
      }
      return NextResponse.json(
        {
          error:
            refundErr instanceof Error
              ? refundErr.message
              : "Failed to process refund webhook",
        },
        { status: 500 }
      );
    }
  }

  const finalized = await finalizePaymentByIntent({
    supabaseAdmin,
    paymentIntentId,
    paid: isPaid,
    paymentAttemptId: attemptId || null,
    rawPayload: event as unknown as Record<string, unknown>,
    merchantOrderId,
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
