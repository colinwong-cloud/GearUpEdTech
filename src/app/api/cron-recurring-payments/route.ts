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
  let response = await supabase.from("parent_payment_orders").insert(payload);
  if (response.error && isMissingOrderTrackingColumnError(response.error.message)) {
    const legacy = { ...payload };
    delete legacy.payment_started_at;
    delete legacy.is_recurring_payment;
    response = await supabase.from("parent_payment_orders").insert(legacy);
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
      const { error: createOrderErr } = await insertParentPaymentOrder(supabase, {
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
      if (createOrderErr) {
        failed += 1;
        failures.push({
          mobile_number: profile.mobile_number,
          reason: createOrderErr.message,
        });
        await markRecurringProfile(supabase, profile.id, {
          status: "failed",
          last_order_status: "failed",
          last_error: createOrderErr.message,
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
          status: "failed",
          last_order_status: "failed",
          last_error: reason,
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
      const normalizedStatus =
        readString(confirmPayload.status)?.toUpperCase() || "";
      const latestAttemptStatus =
        readString(confirmPayload.latest_payment_attempt?.status)?.toUpperCase() || "";
      const paymentAttemptId =
        readString(confirmPayload.latest_payment_attempt?.id) || null;
      const isPaid =
        AIRWALLEX_SUCCESS_STATES.has(normalizedStatus) ||
        AIRWALLEX_SUCCESS_STATES.has(latestAttemptStatus);
      const finalize = await finalizePaymentByIntent({
        supabaseAdmin: supabase,
        paymentIntentId: intentId,
        merchantOrderId,
        paid: isPaid,
        paymentAttemptId,
        rawPayload: confirmPayload as unknown as Record<string, unknown>,
      });

      if (!confirmRes.ok || !finalize.ok || !isPaid) {
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
          status: "failed",
          last_order_id: finalize.orderId,
          last_order_status: "failed",
          last_error: reason,
        });
        continue;
      }

      paid += 1;
      await markRecurringProfile(supabase, profile.id, {
        status: "active",
        last_order_id: finalize.orderId,
        last_order_status: "paid",
        last_error: null,
        last_charged_at: new Date().toISOString(),
        next_charge_at: addOneMonthIsoFrom(profile.next_charge_at),
      });
    }

    return NextResponse.json({
      success: true,
      processed,
      paid,
      failed,
      failures,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
