import type { SupabaseClient } from "@supabase/supabase-js";
import { enforceRecurringCheckoutMethods, getAirwallexMethodsForSelection } from "@/lib/airwallex-checkout-methods";
import { nextMonthlyRecurringStartDate } from "@/lib/airwallex-hpp-mit";
import {
  buildMitConfirmAttempts,
  classifyRecurringChargeFailure,
  isConsentPermanentlyUnusable,
  isConsentUsableForMit,
  shouldTryNextMitConfirmShape,
} from "@/lib/server/recurring-mit-confirm";
import { filterEligibleMitCronProfiles, mitChargeLeaseIso } from "@/lib/server/recurring-mit-cron";
import {
  TUTOR_PLAN_PRICE_HKD,
  extendTutorPaidUntil,
  tutorMerchantOrderId,
} from "@/lib/tutor-billing";

const MIT_POLICY_VERSION = "mit-monthly-merchant-scheduled-v1";

type ApiBody = { json: Record<string, unknown> | null; text: string };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function readApiBody(res: Response): Promise<ApiBody> {
  const text = await res.text();
  if (!text) return { json: null, text: "" };
  try {
    return { json: JSON.parse(text) as Record<string, unknown>, text };
  } catch {
    return { json: null, text };
  }
}

function airwallexError(action: string, status: number, body: ApiBody): string {
  const json = body.json || {};
  const code = typeof json.code === "string" ? json.code : "";
  const message = typeof json.message === "string" ? json.message : "";
  if (code || message) return `Airwallex ${action} failed (${status})${code ? ` [${code}]` : ""}: ${message || "Unknown error"}`;
  return `Airwallex ${action} failed (${status})`;
}

export function getTutorAirwallexBaseUrl(): string {
  const raw = process.env.AIRWALLEX_BASE_URL?.trim() || "";
  const production =
    process.env.NODE_ENV === "production" ||
    (process.env.VERCEL_ENV || "").toLowerCase() === "production";
  if (!raw || raw === "prod" || raw === "production") return "https://api.airwallex.com";
  if (raw === "demo" || raw === "sandbox") {
    return production ? "https://api.airwallex.com" : "https://api-demo.airwallex.com";
  }
  return raw.replace(/\/$/, "") || "https://api.airwallex.com";
}

async function getAccessToken(airwallexBase: string): Promise<string> {
  const clientId = process.env.AIRWALLEX_CLIENT_ID?.trim() || "";
  const apiKey = process.env.AIRWALLEX_API_KEY?.trim() || "";
  if (!clientId || !apiKey) throw new Error("Airwallex credentials not configured");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": clientId,
    "x-api-key": apiKey,
  };
  const loginAs = process.env.AIRWALLEX_ACCOUNT_ID?.trim() || "";
  if (loginAs) headers["x-login-as"] = loginAs;
  const res = await fetch(`${airwallexBase}/api/v1/authentication/login`, {
    method: "POST",
    headers,
    cache: "no-store",
  });
  const body = await readApiBody(res);
  const token = readString(body.json?.token);
  if (!res.ok || !token) throw new Error(airwallexError("authentication", res.status, body));
  return token;
}

async function getOrCreateTutorCustomer(input: {
  airwallexBase: string;
  accessToken: string;
  code: string;
  mobile: string | null;
  email: string | null;
}): Promise<string> {
  const merchantCustomerId = `tutor-${input.code}`;
  const createResp = await fetch(`${input.airwallexBase}/api/v1/pa/customers/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      request_id: crypto.randomUUID(),
      merchant_customer_id: merchantCustomerId,
      phone_number: input.mobile || undefined,
      email: input.email || undefined,
    }),
    cache: "no-store",
  });
  const createBody = await readApiBody(createResp);
  const createdId = readString(createBody.json?.id);
  if (createResp.ok && createdId) return createdId;
  const message = readString(createBody.json?.message)?.toLowerCase() || "";
  const code = readString(createBody.json?.code)?.toLowerCase() || "";
  if (code !== "resource_already_exists" && !message.includes("already exists")) {
    throw new Error(airwallexError("customers/create", createResp.status, createBody));
  }
  const listResp = await fetch(
    `${input.airwallexBase}/api/v1/pa/customers?merchant_customer_id=${encodeURIComponent(merchantCustomerId)}&page_num=0&page_size=1`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );
  const listBody = await readApiBody(listResp);
  const items = Array.isArray(listBody.json?.items) ? (listBody.json?.items as Array<{ id?: string }>) : [];
  const existing = readString(items[0]?.id);
  if (!listResp.ok || !existing) throw new Error(airwallexError("customers/list", listResp.status, listBody));
  return existing;
}

function monthlyTerms(amount: number) {
  return {
    payment_amount_type: "FIXED" as const,
    fixed_payment_amount: amount,
    payment_currency: "HKD" as const,
    payment_schedule: { period: 1, period_unit: "MONTH" as const },
    billing_cycle_charge_day: new Date().getUTCDate(),
    total_billing_cycles: null,
  };
}

export async function createTutorPlanCheckout(input: {
  supabase: SupabaseClient;
  codeId: string;
  code: string;
  tutorName: string | null;
  mobile: string | null;
  email: string | null;
}): Promise<{
  intentId: string;
  clientSecret: string;
  customerId: string;
  amount: number;
  methods: string[];
  terms: ReturnType<typeof monthlyTerms>;
}> {
  const airwallexBase = getTutorAirwallexBaseUrl();
  const accessToken = await getAccessToken(airwallexBase);
  const customerId = await getOrCreateTutorCustomer({
    airwallexBase,
    accessToken,
    code: input.code,
    mobile: input.mobile,
    email: input.email,
  });
  const amount = TUTOR_PLAN_PRICE_HKD;
  const terms = monthlyTerms(amount);
  const methods = enforceRecurringCheckoutMethods(getAirwallexMethodsForSelection("all")).methods;
  const merchantOrderId = tutorMerchantOrderId(input.code);
  const requestId = crypto.randomUUID();
  const createIntentRes = await fetch(`${airwallexBase}/api/v1/pa/payment_intents/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount,
      currency: "HKD",
      merchant_order_id: merchantOrderId,
      request_id: requestId,
      customer_id: customerId,
      payment_consent: {
        next_triggered_by: "merchant",
        merchant_trigger_reason: "scheduled",
        terms_of_use: terms,
      },
      metadata: {
        payer: "tutor",
        code_id: input.codeId,
        tutor_code: input.code,
        recurring_type: "monthly",
        recurring_enabled: true,
        mit_policy_version: MIT_POLICY_VERSION,
        mit_next_triggered_by: "merchant",
        mit_merchant_trigger_reason: "scheduled",
      },
    }),
    cache: "no-store",
  });
  const createIntentBody = await readApiBody(createIntentRes);
  const intentId = readString(createIntentBody.json?.id);
  const clientSecret = readString(createIntentBody.json?.client_secret);
  if (!createIntentRes.ok || !intentId || !clientSecret) {
    throw new Error(airwallexError("payment_intents/create", createIntentRes.status, createIntentBody));
  }
  const { error } = await input.supabase.from("tutor_payment_orders").insert({
    code_id: input.codeId,
    merchant_order_id: merchantOrderId,
    request_id: requestId,
    amount_hkd: amount,
    status: "created",
    airwallex_payment_intent_id: intentId,
    airwallex_customer_id: customerId,
    raw_response: createIntentBody.json,
  });
  if (error) throw new Error(error.message);
  return { intentId, clientSecret, customerId, amount, methods, terms };
}

function readConsent(payload: Record<string, unknown>): {
  consentId: string | null;
  methodId: string | null;
  methodType: string | null;
} {
  const attempt =
    payload.latest_payment_attempt && typeof payload.latest_payment_attempt === "object"
      ? (payload.latest_payment_attempt as Record<string, unknown>)
      : payload;
  const consent =
    attempt.payment_consent && typeof attempt.payment_consent === "object"
      ? (attempt.payment_consent as Record<string, unknown>)
      : attempt;
  const method =
    attempt.payment_method && typeof attempt.payment_method === "object"
      ? (attempt.payment_method as Record<string, unknown>)
      : {};
  return {
    consentId: readString(consent.id) || readString(attempt.payment_consent_id),
    methodId: readString(method.id) || readString(attempt.payment_method_id),
    methodType: readString(method.type) || readString(attempt.payment_method_type),
  };
}

export async function markTutorOrderPaid(input: {
  supabase: SupabaseClient;
  paymentIntentId: string;
  merchantOrderId?: string | null;
  paid: boolean;
  rawPayload: Record<string, unknown>;
}): Promise<{ ok: boolean; alreadyFinalized: boolean; error?: string }> {
  let query = input.supabase.from("tutor_payment_orders").select("id,code_id,status,amount_hkd,airwallex_customer_id,merchant_order_id");
  query = input.merchantOrderId
    ? query.eq("merchant_order_id", input.merchantOrderId)
    : query.eq("airwallex_payment_intent_id", input.paymentIntentId);
  const orderRes = await query.maybeSingle();
  if (orderRes.error) return { ok: false, alreadyFinalized: false, error: orderRes.error.message };
  if (!orderRes.data) return { ok: false, alreadyFinalized: false, error: "Tutor payment order not found" };
  if (orderRes.data.status === "paid") return { ok: true, alreadyFinalized: true };
  if (!input.paid) {
    await input.supabase
      .from("tutor_payment_orders")
      .update({ status: "failed", raw_response: input.rawPayload })
      .eq("id", orderRes.data.id);
    return { ok: true, alreadyFinalized: false };
  }

  const codeRes = await input.supabase
    .from("tutor_referral_codes")
    .select("paid_until")
    .eq("id", orderRes.data.code_id)
    .maybeSingle();
  if (codeRes.error) return { ok: false, alreadyFinalized: false, error: codeRes.error.message };
  const paidUntil = extendTutorPaidUntil(codeRes.data?.paid_until ? String(codeRes.data.paid_until) : null);
  const consent = readConsent(input.rawPayload);
  const nowIso = new Date().toISOString();
  const { error: codeErr } = await input.supabase
    .from("tutor_referral_codes")
    .update({ paid_until: paidUntil })
    .eq("id", orderRes.data.code_id);
  if (codeErr) return { ok: false, alreadyFinalized: false, error: codeErr.message };
  await input.supabase
    .from("tutor_payment_orders")
    .update({
      status: "paid",
      paid_at: nowIso,
      airwallex_payment_intent_id: input.paymentIntentId || orderRes.data.merchant_order_id,
      airwallex_payment_consent_id: consent.consentId,
      airwallex_payment_method_id: consent.methodId,
      payment_method_type: consent.methodType,
      raw_response: input.rawPayload,
    })
    .eq("id", orderRes.data.id);
  if (consent.consentId && orderRes.data.airwallex_customer_id) {
    await input.supabase.from("tutor_recurring_profiles").upsert(
      {
        code_id: orderRes.data.code_id,
        status: "active",
        airwallex_customer_id: orderRes.data.airwallex_customer_id,
        airwallex_payment_consent_id: consent.consentId,
        airwallex_payment_method_id: consent.methodId,
        payment_method_type: consent.methodType,
        recurring_amount_hkd: TUTOR_PLAN_PRICE_HKD,
        currency: "HKD",
        next_charge_at: paidUntil,
        last_charged_at: nowIso,
        last_error: null,
        updated_at: nowIso,
      },
      { onConflict: "code_id" }
    );
  }
  return { ok: true, alreadyFinalized: false };
}

export async function confirmTutorPlanPayment(input: {
  supabase: SupabaseClient;
  codeId: string;
  paymentIntentId: string;
}): Promise<{ ok: boolean; paid: boolean; paidUntil: string | null; error?: string }> {
  const orderRes = await input.supabase
    .from("tutor_payment_orders")
    .select("id,code_id,merchant_order_id,status")
    .eq("code_id", input.codeId)
    .eq("airwallex_payment_intent_id", input.paymentIntentId)
    .maybeSingle();
  if (orderRes.error) return { ok: false, paid: false, paidUntil: null, error: orderRes.error.message };
  if (!orderRes.data) return { ok: false, paid: false, paidUntil: null, error: "找不到這筆導師付款。" };
  const airwallexBase = getTutorAirwallexBaseUrl();
  const accessToken = await getAccessToken(airwallexBase);
  const intentRes = await fetch(
    `${airwallexBase}/api/v1/pa/payment_intents/${encodeURIComponent(input.paymentIntentId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    }
  );
  const intentBody = await readApiBody(intentRes);
  if (!intentRes.ok || !intentBody.json) {
    return { ok: false, paid: false, paidUntil: null, error: airwallexError("payment_intents/retrieve", intentRes.status, intentBody) };
  }
  const status = readString(intentBody.json.status)?.toUpperCase() || "";
  const paid = ["SUCCEEDED", "SUCCESS", "PAID", "CAPTURE_REQUESTED", "SETTLED"].includes(status);
  const finalized = await markTutorOrderPaid({
    supabase: input.supabase,
    paymentIntentId: input.paymentIntentId,
    merchantOrderId: String(orderRes.data.merchant_order_id),
    paid,
    rawPayload: intentBody.json,
  });
  if (!finalized.ok) return { ok: false, paid: false, paidUntil: null, error: finalized.error };
  const codeRes = await input.supabase
    .from("tutor_referral_codes")
    .select("paid_until")
    .eq("id", input.codeId)
    .maybeSingle();
  return {
    ok: true,
    paid,
    paidUntil: codeRes.data?.paid_until ? String(codeRes.data.paid_until) : null,
  };
}

const TUTOR_MIT_PAID_STATES = new Set(["SUCCEEDED", "SUCCESS", "PAID", "CAPTURE_REQUESTED", "SETTLED"]);

function nextTutorMitChargeIso(dueAt: string): string {
  const due = new Date(dueAt);
  const base = Number.isNaN(due.getTime()) ? new Date() : due;
  return nextMonthlyRecurringStartDate(base).toISOString();
}

async function readTutorConsentStatus(input: {
  airwallexBase: string;
  accessToken: string;
  paymentConsentId: string;
}): Promise<{ ok: true; status: string | null } | { ok: false; reason: string }> {
  try {
    const res = await fetch(
      `${input.airwallexBase}/api/v1/pa/payment_consents/${encodeURIComponent(input.paymentConsentId)}`,
      {
        headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
        cache: "no-store",
      }
    );
    const body = await readApiBody(res);
    if (!res.ok) {
      return { ok: false, reason: airwallexError("payment_consents/get", res.status, body) };
    }
    return { ok: true, status: readString(body.json?.status) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Unable to retrieve payment consent" };
  }
}

async function claimTutorChargeCycle(
  supabase: SupabaseClient,
  profile: { id: string; next_charge_at: string; last_charged_at: string | null }
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  let query = supabase
    .from("tutor_recurring_profiles")
    .update({
      next_charge_at: mitChargeLeaseIso(),
      last_error: "mit-charge-in-progress",
      updated_at: nowIso,
    })
    .eq("id", profile.id)
    .eq("next_charge_at", profile.next_charge_at);
  query = profile.last_charged_at
    ? query.eq("last_charged_at", profile.last_charged_at)
    : query.is("last_charged_at", null);
  const { data, error } = await query.select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length === 1;
}

async function recordTutorMitFailure(
  supabase: SupabaseClient,
  profileId: string,
  dueAt: string,
  reason: string,
  consentStatus?: string | null
) {
  const kind = classifyRecurringChargeFailure({ reason, consentStatus });
  await supabase
    .from("tutor_recurring_profiles")
    .update({
      status: kind === "permanent" ? "failed" : "active",
      next_charge_at: dueAt,
      last_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
}

export async function chargeDueTutorPlans(supabase: SupabaseClient): Promise<{ processed: number; paid: number; failed: number }> {
  const now = new Date();
  const list = await supabase
    .from("tutor_recurring_profiles")
    .select("id,code_id,status,airwallex_customer_id,airwallex_payment_consent_id,airwallex_payment_method_id,payment_method_type,recurring_amount_hkd,currency,next_charge_at,last_charged_at,last_error")
    .in("status", ["active", "failed"])
    .lte("next_charge_at", now.toISOString())
    .limit(20);
  if (list.error) {
    if (/tutor_recurring_profiles|42P01|does not exist/i.test(list.error.message)) {
      return { processed: 0, paid: 0, failed: 0 };
    }
    throw list.error;
  }
  const dueProfiles = filterEligibleMitCronProfiles(list.data ?? [], now);
  let processed = 0;
  let paid = 0;
  let failed = 0;
  const airwallexBase = getTutorAirwallexBaseUrl();
  const accessToken = await getAccessToken(airwallexBase);
  for (const profile of dueProfiles) {
    const dueAt = String(profile.next_charge_at);
    if (!profile.airwallex_payment_consent_id || !profile.airwallex_payment_method_id || !profile.payment_method_type || !profile.airwallex_customer_id) {
      failed += 1;
      await recordTutorMitFailure(supabase, profile.id, dueAt, "missing recurring payment credentials");
      continue;
    }
    const consentLookup = await readTutorConsentStatus({
      airwallexBase,
      accessToken,
      paymentConsentId: String(profile.airwallex_payment_consent_id),
    });
    if (!consentLookup.ok) {
      failed += 1;
      await recordTutorMitFailure(supabase, profile.id, dueAt, consentLookup.reason);
      continue;
    }
    if (!isConsentUsableForMit(consentLookup.status)) {
      failed += 1;
      const reason = `Payment consent is not usable for MIT (status=${consentLookup.status || "UNKNOWN"})`;
      console.error(
        "[anti-missing][payment][mit-policy] tutor-consent-not-verified",
        JSON.stringify({
          profile_id: profile.id,
          consent_status: consentLookup.status,
          permanent: isConsentPermanentlyUnusable(consentLookup.status),
        })
      );
      await recordTutorMitFailure(supabase, profile.id, dueAt, reason, consentLookup.status);
      continue;
    }
    const claimed = await claimTutorChargeCycle(supabase, {
      id: profile.id,
      next_charge_at: dueAt,
      last_charged_at: profile.last_charged_at ? String(profile.last_charged_at) : null,
    });
    if (!claimed) continue;
    processed += 1;
    const amount = Number(profile.recurring_amount_hkd || TUTOR_PLAN_PRICE_HKD);
    const merchantOrderId = `tutor-renew-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestId = crypto.randomUUID();
    await supabase.from("tutor_payment_orders").insert({
      code_id: profile.code_id,
      merchant_order_id: merchantOrderId,
      request_id: requestId,
      amount_hkd: amount,
      status: "created",
      airwallex_customer_id: profile.airwallex_customer_id,
      airwallex_payment_consent_id: profile.airwallex_payment_consent_id,
      airwallex_payment_method_id: profile.airwallex_payment_method_id,
      payment_method_type: profile.payment_method_type,
    });
    const createRes = await fetch(`${airwallexBase}/api/v1/pa/payment_intents/create`, {
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
        metadata: { payer: "tutor", code_id: profile.code_id, charge_type: "monthly_recurring" },
      }),
      cache: "no-store",
    });
    const createBody = await readApiBody(createRes);
    const intentId = readString(createBody.json?.id);
    if (!createRes.ok || !intentId) {
      failed += 1;
      await recordTutorMitFailure(
        supabase,
        profile.id,
        dueAt,
        airwallexError("payment_intents/create", createRes.status, createBody)
      );
      continue;
    }
    const attempts = buildMitConfirmAttempts(
      {
        customerId: String(profile.airwallex_customer_id),
        paymentMethodId: String(profile.airwallex_payment_method_id),
        paymentMethodType: String(profile.payment_method_type),
        paymentConsentId: String(profile.airwallex_payment_consent_id),
        requestId: crypto.randomUUID(),
        metadata: { payer: "tutor", merchant_trigger_reason: "scheduled" },
      },
      [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    );
    let confirmRes: Response | null = null;
    let confirmBody: ApiBody = { json: null, text: "" };
    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
      const attempt = attempts[attemptIndex];
      console.info(
        "[anti-missing][payment][mit-policy] tutor-subsequent-confirm-payload",
        JSON.stringify({
          profile_id: profile.id,
          shape: attempt.shape,
          has_payment_consent_id: Boolean(attempt.payload.payment_consent_id),
          triggered_by: attempt.payload.triggered_by ?? null,
        })
      );
      confirmRes = await fetch(`${airwallexBase}/api/v1/pa/payment_intents/${encodeURIComponent(intentId)}/confirm`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(attempt.payload),
        cache: "no-store",
      });
      confirmBody = await readApiBody(confirmRes);
      if (confirmRes.ok) break;
      const attemptReason = airwallexError("payment_intents/confirm", confirmRes.status, confirmBody);
      const hasNextShape = attemptIndex < attempts.length - 1;
      if (!hasNextShape || !shouldTryNextMitConfirmShape(attemptReason)) break;
      console.info(
        "[anti-missing][payment][mit-policy] tutor-subsequent-confirm-retry",
        JSON.stringify({
          profile_id: profile.id,
          failed_shape: attempt.shape,
          next_shape: attempts[attemptIndex + 1]?.shape ?? null,
          first_reason: attemptReason,
        })
      );
    }
    const status = readString(confirmBody.json?.status)?.toUpperCase() || "";
    const succeeded = Boolean(confirmRes?.ok) && TUTOR_MIT_PAID_STATES.has(status);
    await markTutorOrderPaid({
      supabase,
      paymentIntentId: intentId,
      merchantOrderId,
      paid: succeeded,
      rawPayload: confirmBody.json || {},
    });
    if (!succeeded) {
      failed += 1;
      const reason = confirmRes
        ? airwallexError("payment_intents/confirm", confirmRes.status, confirmBody)
        : "MIT confirm did not run";
      await recordTutorMitFailure(supabase, profile.id, dueAt, reason);
      continue;
    }
    const nextChargeAt = nextTutorMitChargeIso(dueAt);
    const chargedAt = new Date().toISOString();
    await supabase
      .from("tutor_recurring_profiles")
      .update({
        status: "active",
        next_charge_at: nextChargeAt,
        last_charged_at: chargedAt,
        last_error: null,
        updated_at: chargedAt,
      })
      .eq("id", profile.id);
    paid += 1;
  }
  return { processed, paid, failed };
}
