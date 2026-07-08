import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  AIRWALLEX_SUCCESS_STATES,
  finalizePaymentByIntent,
  getAirwallexAccessToken,
  getAirwallexBaseUrl,
} from "@/lib/server/payment-finalize";

export const maxDuration = 300;

type RecurringProfileRow = {
  id: string;
  parent_id: string | null;
  mobile_number: string;
  status: "active" | "paused" | "cancelled" | "failed";
  airwallex_customer_id: string | null;
  airwallex_payment_consent_id: string | null;
  airwallex_payment_method_id: string | null;
  payment_method_type: string | null;
  recurring_amount_hkd: number;
  currency: string | null;
  next_charge_at: string;
};

type ApiBody = {
  json: Record<string, unknown> | null;
  text: string;
};

type IntentCreatePayload = {
  id?: string;
  status?: string;
  latest_payment_attempt?: {
    id?: string;
    status?: string;
  };
};

type RecurringOrderRow = {
  id: string;
  merchant_order_id: string;
  airwallex_payment_intent_id: string | null;
  created_at: string;
};

type RecurringChargeOutcome = "paid" | "pending" | "failed";

const PENDING_RECHECK_HOURS = 24;
const FAILED_RETRY_HOURS = 24;
const RETRYABLE_INTENT_STATES = new Set([
  "PENDING",
  "PENDING_REVIEW",
  "REQUIRES_CUSTOMER_ACTION",
  "REQUIRES_CAPTURE",
  "REQUIRES_CONFIRMATION",
]);
const TERMINAL_FAILED_INTENT_STATES = new Set([
  "CANCELLED",
  "FAILED",
  "REQUIRES_PAYMENT_METHOD",
]);
const RETRYABLE_ATTEMPT_STATES = new Set([
  "RECEIVED",
  "PENDING_AUTHORIZATION",
  "AUTHENTICATION_REDIRECTED",
  "AUTHORIZED",
]);
const TERMINAL_FAILED_ATTEMPT_STATES = new Set([
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_FAILED",
  "FAILED_TO_PROCESS",
  "CAPTURE_FAILED",
  "RISK_DECLINED",
  "EXPIRED",
  "CANCELLED",
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

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function readApiBody(res: Response): Promise<ApiBody> {
  const text = await res.text();
  if (!text) {
    return { json: null, text: "" };
  }
  try {
    return {
      json: JSON.parse(text) as Record<string, unknown>,
      text,
    };
  } catch {
    return { json: null, text };
  }
}

function formatAirwallexError({
  action,
  status,
  body,
}: {
  action: string;
  status: number;
  body: ApiBody;
}): string {
  const json = body.json || {};
  const code = typeof json.code === "string" ? json.code : "";
  const message = typeof json.message === "string" ? json.message : "";
  if (code || message) {
    return `Airwallex ${action} failed (${status})${code ? ` [${code}]` : ""}: ${message || "Unknown error"}`;
  }
  const snippet = body.text.replace(/\s+/g, " ").slice(0, 220);
  return `Airwallex ${action} failed (${status})${snippet ? `: ${snippet}` : ""}`;
}

function addOneMonthIsoFrom(value: string): string {
  const source = new Date(value);
  const next = Number.isNaN(source.getTime()) ? new Date() : source;
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}

function addHoursIsoFrom(value: string, hours: number): string {
  const source = new Date(value);
  const next = Number.isNaN(source.getTime()) ? new Date() : source;
  next.setUTCHours(next.getUTCHours() + hours);
  return next.toISOString();
}

function normalizeAirwallexState(value: unknown): string {
  return readString(value)?.toUpperCase() || "";
}

function classifyRecurringOutcome({
  httpOk,
  intentStatus,
  attemptStatus,
}: {
  httpOk: boolean;
  intentStatus: string;
  attemptStatus: string;
}): RecurringChargeOutcome {
  if (!httpOk) return "failed";
  if (AIRWALLEX_SUCCESS_STATES.has(intentStatus) || AIRWALLEX_SUCCESS_STATES.has(attemptStatus)) {
    return "paid";
  }
  if (
    TERMINAL_FAILED_INTENT_STATES.has(intentStatus) ||
    TERMINAL_FAILED_ATTEMPT_STATES.has(attemptStatus)
  ) {
    return "failed";
  }
  if (
    RETRYABLE_INTENT_STATES.has(intentStatus) ||
    RETRYABLE_ATTEMPT_STATES.has(attemptStatus)
  ) {
    return "pending";
  }
  return "pending";
}

async function loadLatestOpenRecurringOrder(
  supabase: ReturnType<typeof getSupabaseAdmin> extends infer T ? Exclude<T, null> : never,
  mobile: string
): Promise<RecurringOrderRow | null> {
  const result = await supabase
    .from("parent_payment_orders")
    .select("id,merchant_order_id,airwallex_payment_intent_id,created_at")
    .eq("mobile_number", mobile)
    .eq("status", "created")
    .eq("is_recurring_payment", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!result.error) {
    return (result.data as RecurringOrderRow | null) ?? null;
  }

  if (!/is_recurring_payment/i.test(result.error.message || "")) {
    throw result.error;
  }

  const fallback = await supabase
    .from("parent_payment_orders")
    .select("id,merchant_order_id,airwallex_payment_intent_id,created_at")
    .eq("mobile_number", mobile)
    .eq("status", "created")
    .eq("payment_method", "recurring_auto_charge")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallback.error) {
    throw fallback.error;
  }
  return (fallback.data as RecurringOrderRow | null) ?? null;
}

async function retrievePaymentIntentStatus(
  airwallexBase: string,
  accessToken: string,
  paymentIntentId: string
) {
  const response = await fetch(
    `${airwallexBase}/api/v1/pa/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );
  const body = await readApiBody(response);
  const payload = (body.json || {}) as IntentCreatePayload;
  return {
    response,
    body,
    payload,
    intentStatus: normalizeAirwallexState(payload.status),
    attemptStatus: normalizeAirwallexState(payload.latest_payment_attempt?.status),
    paymentAttemptId: readString(payload.latest_payment_attempt?.id) || null,
  };
}

async function markRecurringProfile(
  supabase: ReturnType<typeof getSupabaseAdmin> extends infer T ? Exclude<T, null> : never,
  profileId: string,
  updates: Record<string, unknown>
) {
  const { error } = await supabase
    .from("parent_recurring_profiles")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
  if (error) {
    throw error;
  }
}

function isMissingOrderTrackingColumnError(message: string): boolean {
  return /payment_started_at|is_recurring_payment/i.test(message);
}

async function insertParentPaymentOrder(
  supabase: ReturnType<typeof getSupabaseAdmin> extends infer T ? Exclude<T, null> : never,
  payload: Record<string, unknown>
) {
  let response = await supabase
    .from("parent_payment_orders")
    .insert(payload)
    .select("id")
    .limit(1)
    .maybeSingle();
  if (response.error && isMissingOrderTrackingColumnError(response.error.message)) {
    const legacy = { ...payload };
    delete legacy.payment_started_at;
    delete legacy.is_recurring_payment;
    response = await supabase
      .from("parent_payment_orders")
      .insert(legacy)
      .select("id")
      .limit(1)
      .maybeSingle();
  }
  return response;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role env missing" }, { status: 503 });
  }

  let processed = 0;
  let paid = 0;
  let failed = 0;
  let pending = 0;
  const failures: Array<{ mobile_number: string; reason: string }> = [];

  try {
    const airwallexBase = getAirwallexBaseUrl();
    const accessToken = await getAirwallexAccessToken(airwallexBase);
    const { data: profiles, error: listErr } = await supabase
      .from("parent_recurring_profiles")
      .select(
        "id,parent_id,mobile_number,status,airwallex_customer_id,airwallex_payment_consent_id,airwallex_payment_method_id,payment_method_type,recurring_amount_hkd,currency,next_charge_at"
      )
      .eq("status", "active")
      .lte("next_charge_at", new Date().toISOString())
      .order("next_charge_at", { ascending: true })
      .limit(100);

    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }

    for (const profile of (profiles as RecurringProfileRow[] | null) ?? []) {
      processed += 1;

      const openOrder = await loadLatestOpenRecurringOrder(supabase, profile.mobile_number);
      if (openOrder) {
        const nowIso = new Date().toISOString();
        if (!openOrder.airwallex_payment_intent_id) {
          const reason = "Recurring order is missing payment_intent_id";
          await finalizePaymentByIntent({
            supabaseAdmin: supabase,
            paymentIntentId: "",
            merchantOrderId: openOrder.merchant_order_id,
            paid: false,
            paymentAttemptId: null,
            rawPayload: {
              flow: "cron_recurring",
              stage: "recover_open_order",
              error: reason,
            },
          });
          failed += 1;
          failures.push({ mobile_number: profile.mobile_number, reason });
          await markRecurringProfile(supabase, profile.id, {
            status: "active",
            last_order_id: openOrder.id,
            last_order_status: "failed",
            last_error: reason,
            next_charge_at: addHoursIsoFrom(nowIso, FAILED_RETRY_HOURS),
          });
          continue;
        }

        const intentSnapshot = await retrievePaymentIntentStatus(
          airwallexBase,
          accessToken,
          openOrder.airwallex_payment_intent_id
        );
        const openOrderOutcome = classifyRecurringOutcome({
          httpOk: intentSnapshot.response.ok,
          intentStatus: intentSnapshot.intentStatus,
          attemptStatus: intentSnapshot.attemptStatus,
        });

        if (openOrderOutcome === "pending") {
          pending += 1;
          await markRecurringProfile(supabase, profile.id, {
            status: "active",
            last_order_id: openOrder.id,
            last_order_status: "created",
            last_error: `Recurring payment is still pending (${intentSnapshot.intentStatus || intentSnapshot.attemptStatus || "UNKNOWN"})`,
            next_charge_at: addHoursIsoFrom(nowIso, PENDING_RECHECK_HOURS),
          });
          continue;
        }

        const finalizedOpenOrder = await finalizePaymentByIntent({
          supabaseAdmin: supabase,
          paymentIntentId: openOrder.airwallex_payment_intent_id,
          merchantOrderId: openOrder.merchant_order_id,
          paid: openOrderOutcome === "paid",
          paymentAttemptId: intentSnapshot.paymentAttemptId,
          rawPayload: intentSnapshot.payload as unknown as Record<string, unknown>,
        });

        if (!finalizedOpenOrder.ok) {
          const reason = finalizedOpenOrder.error || "Unable to finalize open recurring order";
          failed += 1;
          failures.push({ mobile_number: profile.mobile_number, reason });
          await markRecurringProfile(supabase, profile.id, {
            status: "active",
            last_order_id: finalizedOpenOrder.orderId ?? openOrder.id,
            last_order_status: "failed",
            last_error: reason,
            next_charge_at: addHoursIsoFrom(nowIso, FAILED_RETRY_HOURS),
          });
          continue;
        }

        if (openOrderOutcome === "paid") {
          paid += 1;
          await markRecurringProfile(supabase, profile.id, {
            status: "active",
            last_order_id: finalizedOpenOrder.orderId ?? openOrder.id,
            last_order_status: "paid",
            last_error: null,
            last_charged_at: nowIso,
            next_charge_at: addOneMonthIsoFrom(nowIso),
          });
        } else {
          failed += 1;
          const reason = `Recurring payment failed (${intentSnapshot.intentStatus || intentSnapshot.attemptStatus || "UNKNOWN"})`;
          failures.push({ mobile_number: profile.mobile_number, reason });
          await markRecurringProfile(supabase, profile.id, {
            status: "active",
            last_order_id: finalizedOpenOrder.orderId ?? openOrder.id,
            last_order_status: "failed",
            last_error: reason,
            next_charge_at: addHoursIsoFrom(nowIso, FAILED_RETRY_HOURS),
          });
        }
        continue;
      }

      if (
        !profile.airwallex_customer_id ||
        !profile.airwallex_payment_method_id ||
        !profile.payment_method_type
      ) {
        failed += 1;
        const reason = "Missing recurring payment credentials";
        failures.push({ mobile_number: profile.mobile_number, reason });
        await markRecurringProfile(supabase, profile.id, {
          status: "failed",
          last_order_status: "failed",
          last_error: reason,
        });
        continue;
      }

      const amount = Number(profile.recurring_amount_hkd || 0);
      if (!(amount > 0)) {
        failed += 1;
        const reason = "Recurring amount is invalid";
        failures.push({ mobile_number: profile.mobile_number, reason });
        await markRecurringProfile(supabase, profile.id, {
          status: "failed",
          last_order_status: "failed",
          last_error: reason,
        });
        continue;
      }

      const merchantOrderId = `GU-R-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const requestId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      const createOrder = await insertParentPaymentOrder(supabase, {
        parent_id: profile.parent_id,
        mobile_number: profile.mobile_number,
        merchant_order_id: merchantOrderId,
        request_id: requestId,
        amount_hkd: amount,
        discount_code: null,
        discount_percent: 0,
        final_amount_hkd: amount,
        payment_method: "recurring_auto_charge",
        status: "created",
        payment_started_at: startedAt,
        is_recurring_payment: true,
        airwallex_customer_id: profile.airwallex_customer_id,
        airwallex_payment_consent_id: profile.airwallex_payment_consent_id,
        airwallex_payment_method_id: profile.airwallex_payment_method_id,
      });
      const createdOrderId = (createOrder.data as { id?: string } | null)?.id ?? null;
      if (createOrder.error) {
        failed += 1;
        failures.push({
          mobile_number: profile.mobile_number,
          reason: createOrder.error.message,
        });
        await markRecurringProfile(supabase, profile.id, {
          status: "active",
          last_order_status: "failed",
          last_error: createOrder.error.message,
          next_charge_at: addHoursIsoFrom(startedAt, FAILED_RETRY_HOURS),
        });
        continue;
      }

      const createIntentRes = await fetch(`${airwallexBase}/api/v1/pa/payment_intents/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          amount,
          currency: profile.currency || "HKD",
          customer_id: profile.airwallex_customer_id,
          merchant_order_id: merchantOrderId,
          request_id: requestId,
          metadata: {
            recurring_profile_id: profile.id,
            mobile_number: profile.mobile_number,
            charge_type: "monthly_recurring",
          },
        }),
        cache: "no-store",
      });
      const createIntentBody = await readApiBody(createIntentRes);
      const createIntent = (createIntentBody.json || {}) as IntentCreatePayload;
      const intentId = readString(createIntent.id);
      if (!createIntentRes.ok || !intentId) {
        const reason = formatAirwallexError({
          action: "payment_intents/create",
          status: createIntentRes.status,
          body: createIntentBody,
        });
        failed += 1;
        failures.push({ mobile_number: profile.mobile_number, reason });
        await markRecurringProfile(supabase, profile.id, {
          status: "active",
          last_order_id: createdOrderId,
          last_order_status: "failed",
          last_error: reason,
          next_charge_at: addHoursIsoFrom(startedAt, FAILED_RETRY_HOURS),
        });
        await finalizePaymentByIntent({
          supabaseAdmin: supabase,
          paymentIntentId: "",
          merchantOrderId,
          paid: false,
          paymentAttemptId: null,
          rawPayload: {
            flow: "cron_recurring",
            stage: "create_intent",
            error: reason,
          },
        });
        continue;
      }

      const confirmRes = await fetch(
        `${airwallexBase}/api/v1/pa/payment_intents/${encodeURIComponent(intentId)}/confirm`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            customer_id: profile.airwallex_customer_id,
            payment_method: {
              id: profile.airwallex_payment_method_id,
              type: profile.payment_method_type,
            },
            payment_consent_id: profile.airwallex_payment_consent_id || undefined,
            external_recurring_data: {
              initial_payment: false,
              triggered_by: "merchant",
              merchant_trigger_reason: "scheduled",
            },
            request_id: crypto.randomUUID(),
            metadata: {
              recurring_profile_id: profile.id,
              mobile_number: profile.mobile_number,
              charge_type: "monthly_recurring",
            },
          }),
          cache: "no-store",
        }
      );
      const confirmBody = await readApiBody(confirmRes);
      const confirmPayload = (confirmBody.json || {}) as IntentCreatePayload;
      const normalizedStatus = normalizeAirwallexState(confirmPayload.status);
      const latestAttemptStatus = normalizeAirwallexState(confirmPayload.latest_payment_attempt?.status);
      const paymentAttemptId =
        readString(confirmPayload.latest_payment_attempt?.id) || null;
      const outcome = classifyRecurringOutcome({
        httpOk: confirmRes.ok,
        intentStatus: normalizedStatus,
        attemptStatus: latestAttemptStatus,
      });

      if (outcome === "pending") {
        pending += 1;
        await markRecurringProfile(supabase, profile.id, {
          status: "active",
          last_order_id: createdOrderId,
          last_order_status: "created",
          last_error: `Recurring payment is pending (${normalizedStatus || latestAttemptStatus || "UNKNOWN"})`,
          next_charge_at: addHoursIsoFrom(startedAt, PENDING_RECHECK_HOURS),
        });
        continue;
      }

      const finalize = await finalizePaymentByIntent({
        supabaseAdmin: supabase,
        paymentIntentId: intentId,
        merchantOrderId,
        paid: outcome === "paid",
        paymentAttemptId,
        rawPayload: confirmPayload as unknown as Record<string, unknown>,
      });

      if (!confirmRes.ok || !finalize.ok || outcome !== "paid") {
        const reason = !confirmRes.ok
          ? formatAirwallexError({
              action: "payment_intents/confirm",
              status: confirmRes.status,
              body: confirmBody,
            })
          : finalize.error ||
            `Recurring charge failed (status=${normalizedStatus || latestAttemptStatus || "UNKNOWN"})`;
        failed += 1;
        failures.push({ mobile_number: profile.mobile_number, reason });
        await markRecurringProfile(supabase, profile.id, {
          status: "active",
          last_order_id: finalize.orderId ?? createdOrderId,
          last_order_status: "failed",
          last_error: reason,
          next_charge_at: addHoursIsoFrom(startedAt, FAILED_RETRY_HOURS),
        });
        continue;
      }

      paid += 1;
      await markRecurringProfile(supabase, profile.id, {
        status: "active",
        last_order_id: finalize.orderId ?? createdOrderId,
        last_order_status: "paid",
        last_error: null,
        last_charged_at: new Date().toISOString(),
        next_charge_at: addOneMonthIsoFrom(startedAt),
      });
    }

    console.info(
      "[cron-recurring-payments] completed",
      JSON.stringify({ processed, paid, failed, pending, failures: failures.length })
    );

    return NextResponse.json({
      success: true,
      processed,
      paid,
      failed,
      pending,
      failures,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron-recurring-payments] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
