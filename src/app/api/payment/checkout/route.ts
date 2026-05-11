import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAndFinalizeParentPayment } from "@/lib/server/payment-finalize";

const DEFAULT_AIRWALLEX_BASE = "https://api.airwallex.com";
const DEFAULT_AIRWALLEX_CHECKOUT_LOCALE = "zh-HK";
const PRICE_HKD = 99;
const AIRWALLEX_METHOD_MAP: Record<string, string[]> = {
  all: ["card", "applepay", "googlepay", "alipayhk", "wechatpay"],
  cards: ["card"],
  apple_pay: ["applepay"],
  google_pay: ["googlepay"],
  alipay: ["alipayhk"],
  wechat_pay: ["wechatpay"],
};

function resolveAirwallexBaseUrl(rawBase: string | undefined): string {
  const isProductionRuntime =
    process.env.NODE_ENV === "production" ||
    (process.env.VERCEL_ENV || "").toLowerCase() === "production";
  const trimmed = rawBase?.trim() || "";
  if (!trimmed) return DEFAULT_AIRWALLEX_BASE;

  const normalized = trimmed.toLowerCase();
  if (normalized === "prod" || normalized === "production" || normalized === "live") {
    return "https://api.airwallex.com";
  }
  if (normalized === "demo" || normalized === "sandbox" || normalized === "test") {
    if (isProductionRuntime) return "https://api.airwallex.com";
    return "https://api-demo.airwallex.com";
  }
  if (normalized === "api.airwallex.com") {
    return "https://api.airwallex.com";
  }
  if (normalized === "api-demo.airwallex.com") {
    if (isProductionRuntime) return "https://api.airwallex.com";
    return "https://api-demo.airwallex.com";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      if (isProductionRuntime && parsed.hostname.toLowerCase() === "api-demo.airwallex.com") {
        return "https://api.airwallex.com";
      }
    } catch {
      // keep current fallback below for malformed custom values
    }
    return trimmed.replace(/\/$/, "");
  }
  return `https://${trimmed.replace(/\/$/, "")}`;
}

function isAirwallexApiHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "airwallex.com" || normalized.endsWith(".airwallex.com");
}

function getAirwallexBaseUrl(): string {
  const resolved = resolveAirwallexBaseUrl(process.env.AIRWALLEX_BASE_URL);

  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch {
    throw new Error(
      `AIRWALLEX_BASE_URL is invalid (${resolved}). Use https://api.airwallex.com or https://api-demo.airwallex.com`
    );
  }

  if (!isAirwallexApiHost(parsed.hostname)) {
    throw new Error(
      `AIRWALLEX_BASE_URL must target Airwallex API host. Current host: ${parsed.hostname}`
    );
  }

  return parsed.origin.replace(/\/$/, "");
}

type ApiBody = {
  json: Record<string, unknown> | null;
  text: string;
};

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
  const snippet = body.text.replace(/\s+/g, " ").slice(0, 200);
  return `Airwallex ${action} failed (${status})${snippet ? `: ${snippet}` : ""}`;
}

type DiscountResult = {
  valid: boolean;
  code: string | null;
  discount_percent: number;
  salesperson: string | null;
};

type CheckoutBody = {
  mobile_number?: string;
  discount_code?: string | null;
  payment_method?: string | null;
};

type PendingOrderRow = {
  id: string;
  merchant_order_id: string;
  airwallex_payment_intent_id: string | null;
  raw_response: Record<string, unknown> | null;
  created_at: string;
};

type AirwallexCustomerCreateResponse = {
  id?: string;
  code?: string;
  message?: string;
};

type AirwallexCustomerListResponse = {
  items?: Array<{
    id?: string;
    merchant_customer_id?: string;
  }>;
};

type AirwallexRegisteredDomainsResponse = {
  items?: string[];
};

type AirwallexPaymentMethodTypesResponse = {
  items?: Array<{
    name?: string;
  }>;
};

type AirwallexMethodAvailabilityDiagnostics = {
  availableMethods: string[];
  applePayAvailable: boolean | null;
  warning: string | null;
};

function getServerSupabase() {
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
  return trimmed || null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseLegacyCheckoutUrl(checkoutUrl: string | null) {
  if (!checkoutUrl) {
    return {
      intentId: null,
      clientSecret: null,
      currency: null,
      countryCode: null,
      paymentMethod: null,
    };
  }
  try {
    const parsed = new URL(checkoutUrl, "https://local.checkout");
    const params = parsed.searchParams;
    return {
      intentId: readString(params.get("intent_id")),
      clientSecret: readString(params.get("client_secret")),
      currency: readString(params.get("currency")),
      countryCode: readString(params.get("country_code")),
      paymentMethod: readString(params.get("payment_method")),
    };
  } catch {
    return {
      intentId: null,
      clientSecret: null,
      currency: null,
      countryCode: null,
      paymentMethod: null,
    };
  }
}

function getStoredCheckoutInfo(rawResponse: Record<string, unknown> | null) {
  const checkout = readObject(rawResponse?.checkout);
  if (!checkout) {
    const legacyUrl =
      readString(rawResponse?.checkout_url) ||
      readString(rawResponse?.hosted_payment_url);
    const legacy = parseLegacyCheckoutUrl(legacyUrl);
    return {
      checkoutUrl: legacyUrl,
      intentId: legacy.intentId,
      clientSecret: legacy.clientSecret,
      currency: legacy.currency || "HKD",
      countryCode: legacy.countryCode || "HK",
      paymentMethod: legacy.paymentMethod || "all",
      methods: getAirwallexMethods(legacy.paymentMethod || "all"),
    };
  }
  const intent = readObject(checkout.intent);
  const checkoutUrl =
    readString(checkout.url) || readString(checkout.hosted_payment_url);
  const legacy = parseLegacyCheckoutUrl(checkoutUrl);
  const fallbackPaymentMethod = legacy.paymentMethod || "all";
  const methods =
    Array.isArray(checkout.methods) && checkout.methods.every((m) => typeof m === "string")
      ? (checkout.methods as string[])
      : getAirwallexMethods(fallbackPaymentMethod);
  return {
    checkoutUrl,
    intentId: readString(intent?.id) || legacy.intentId,
    clientSecret: readString(intent?.client_secret) || legacy.clientSecret,
    currency: readString(checkout.currency) || legacy.currency || "HKD",
    countryCode: readString(checkout.country_code) || legacy.countryCode || "HK",
    paymentMethod: readString(checkout.payment_method) || fallbackPaymentMethod,
    methods,
  };
}

async function reconcilePendingOrder({
  supabase,
  order,
}: {
  supabase: ReturnType<typeof getServerSupabase> extends infer T ? Exclude<T, null> : never;
  order: PendingOrderRow;
}): Promise<{
  paid: boolean;
  checkoutUrl: string | null;
  intentId: string | null;
  clientSecret: string | null;
  currency: string;
  countryCode: string;
  paymentMethod: string;
  methods: string[];
}> {
  const stored = getStoredCheckoutInfo(order.raw_response);
  const checkoutUrl = stored.checkoutUrl;

  if (order.airwallex_payment_intent_id) {
    const verify = await verifyAndFinalizeParentPayment({
      supabaseAdmin: supabase,
      paymentIntentId: order.airwallex_payment_intent_id,
      merchantOrderId: order.merchant_order_id,
    });
    return {
      paid: verify.paid,
      checkoutUrl,
      intentId: verify.payment_intent_id,
      clientSecret: stored.clientSecret,
      currency: stored.currency,
      countryCode: stored.countryCode,
      paymentMethod: stored.paymentMethod,
      methods: stored.methods,
    };
  }
  return {
    paid: false,
    checkoutUrl,
    intentId: stored.intentId,
    clientSecret: stored.clientSecret,
    currency: stored.currency,
    countryCode: stored.countryCode,
    paymentMethod: stored.paymentMethod,
    methods: stored.methods,
  };
}

async function getAirwallexAccessToken(airwallexBase: string) {
  const clientId = process.env.AIRWALLEX_CLIENT_ID?.trim() || "";
  const apiKey = process.env.AIRWALLEX_API_KEY?.trim() || "";
  const loginAs = process.env.AIRWALLEX_ACCOUNT_ID?.trim() || "";

  if (!clientId || !apiKey) {
    throw new Error("Airwallex credentials not configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": clientId,
    "x-api-key": apiKey,
  };
  if (loginAs) headers["x-login-as"] = loginAs;

  const res = await fetch(`${airwallexBase}/api/v1/authentication/login`, {
    method: "POST",
    headers,
    cache: "no-store",
  });
  const body = await readApiBody(res);
  const payload = (body.json || {}) as { token?: string };
  if (!res.ok || !payload.token) {
    throw new Error(
      formatAirwallexError({
        action: "authentication",
        status: res.status,
        body,
      })
    );
  }
  return payload.token;
}

function getAirwallexMethods(paymentMethod: string): string[] {
  return AIRWALLEX_METHOD_MAP[paymentMethod] ?? AIRWALLEX_METHOD_MAP.all;
}

function getAirwallexCheckoutLocale(): string {
  const locale =
    process.env.AIRWALLEX_CHECKOUT_LOCALE?.trim() ||
    process.env.NEXT_PUBLIC_AIRWALLEX_CHECKOUT_LOCALE?.trim() ||
    "";
  return locale || DEFAULT_AIRWALLEX_CHECKOUT_LOCALE;
}

function shouldRegisterApplePayDomainsForCheckout(): boolean {
  const raw = process.env.AIRWALLEX_REGISTER_APPLEPAY_DOMAINS_FOR_HPP?.trim().toLowerCase() || "";
  return raw === "1" || raw === "true" || raw === "yes";
}

function normalizeDomainValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() || "";
  if (!trimmed) return null;

  let domainCandidate = trimmed;
  if (domainCandidate.startsWith("http://") || domainCandidate.startsWith("https://")) {
    try {
      domainCandidate = new URL(domainCandidate).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  domainCandidate = domainCandidate.split(",")[0]?.trim() || "";
  domainCandidate = domainCandidate.split("/")[0]?.trim() || "";
  domainCandidate = domainCandidate.split(":")[0]?.trim() || "";
  if (!domainCandidate || !domainCandidate.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(domainCandidate)) return null;
  return domainCandidate;
}

function getApplePayRegisteredDomains(req: Request): string[] {
  const domains = new Set<string>();
  const addDomain = (value: string | null | undefined) => {
    const normalized = normalizeDomainValue(value);
    if (normalized) domains.add(normalized);
  };

  const explicitDomains = process.env.AIRWALLEX_APPLEPAY_REGISTERED_DOMAINS?.trim() || "";
  if (explicitDomains) {
    for (const item of explicitDomains.split(/[,\s]+/)) {
      addDomain(item);
    }
  } else {
    addDomain(process.env.NEXT_PUBLIC_APP_BASE_URL);
    addDomain(process.env.APP_BASE_URL);
    addDomain(req.headers.get("x-forwarded-host"));
    addDomain(req.headers.get("host"));
  }

  return Array.from(domains);
}

function isAlreadyEnabledLikeError(status: number, body: ApiBody): boolean {
  const code = readString(body.json?.code)?.toLowerCase() || "";
  const message = readString(body.json?.message)?.toLowerCase() || "";
  return (
    status === 409 ||
    code.includes("already") ||
    message.includes("already") ||
    message.includes("exists")
  );
}

async function ensureApplePayCapabilityEnabled({
  airwallexBase,
  accessToken,
}: {
  airwallexBase: string;
  accessToken: string;
}) {
  const res = await fetch(
    `${airwallexBase}/api/v1/account_capabilities/payments_applepay/enable`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );
  const body = await readApiBody(res);
  if (!res.ok && !isAlreadyEnabledLikeError(res.status, body)) {
    throw new Error(
      formatAirwallexError({
        action: "account_capabilities/payments_applepay/enable",
        status: res.status,
        body,
      })
    );
  }
}

async function listApplePayRegisteredDomains({
  airwallexBase,
  accessToken,
}: {
  airwallexBase: string;
  accessToken: string;
}): Promise<string[]> {
  const res = await fetch(
    `${airwallexBase}/api/v1/pa/config/applepay/registered_domains`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );
  const body = await readApiBody(res);
  if (!res.ok) {
    throw new Error(
      formatAirwallexError({
        action: "config/applepay/registered_domains",
        status: res.status,
        body,
      })
    );
  }
  const payload = (body.json || {}) as AirwallexRegisteredDomainsResponse;
  if (!Array.isArray(payload.items)) return [];
  return payload.items
    .map((item) => normalizeDomainValue(item))
    .filter((item): item is string => Boolean(item));
}

async function addApplePayRegisteredDomains({
  airwallexBase,
  accessToken,
  domains,
}: {
  airwallexBase: string;
  accessToken: string;
  domains: string[];
}) {
  if (domains.length === 0) return;
  const res = await fetch(
    `${airwallexBase}/api/v1/pa/config/applepay/registered_domains/add_items`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ items: domains }),
      cache: "no-store",
    }
  );
  const body = await readApiBody(res);
  if (!res.ok && !isAlreadyEnabledLikeError(res.status, body)) {
    throw new Error(
      formatAirwallexError({
        action: "config/applepay/registered_domains/add_items",
        status: res.status,
        body,
      })
    );
  }
}

async function ensureApplePayActivated({
  req,
  airwallexBase,
  accessToken,
}: {
  req: Request;
  airwallexBase: string;
  accessToken: string;
}) {
  const targetDomains = getApplePayRegisteredDomains(req);
  if (targetDomains.length === 0) return;

  await ensureApplePayCapabilityEnabled({ airwallexBase, accessToken });
  const registeredDomains = await listApplePayRegisteredDomains({
    airwallexBase,
    accessToken,
  });
  const registeredSet = new Set(registeredDomains);
  const missingDomains = targetDomains.filter((domain) => !registeredSet.has(domain));
  await addApplePayRegisteredDomains({
    airwallexBase,
    accessToken,
    domains: missingDomains,
  });
}

async function getAirwallexMethodAvailabilityDiagnostics({
  airwallexBase,
  accessToken,
  transactionCurrency,
  countryCode,
  transactionMode,
}: {
  airwallexBase: string;
  accessToken: string;
  transactionCurrency: string;
  countryCode: string;
  transactionMode: "oneoff" | "recurring";
}): Promise<AirwallexMethodAvailabilityDiagnostics> {
  const params = new URLSearchParams({
    transaction_currency: transactionCurrency,
    country_code: countryCode,
    transaction_mode: transactionMode,
    active: "true",
    page_num: "0",
    page_size: "100",
  });

  try {
    const res = await fetch(
      `${airwallexBase}/api/v1/pa/config/payment_method_types?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    const body = await readApiBody(res);
    if (!res.ok) {
      throw new Error(
        formatAirwallexError({
          action: "config/payment_method_types",
          status: res.status,
          body,
        })
      );
    }

    const payload = (body.json || {}) as AirwallexPaymentMethodTypesResponse;
    const availableMethods = Array.isArray(payload.items)
      ? Array.from(
          new Set(
            payload.items
              .map((item) => readString(item?.name)?.toLowerCase() || "")
              .filter(Boolean)
          )
        )
      : [];

    return {
      availableMethods,
      applePayAvailable: availableMethods.includes("applepay"),
      warning: null,
    };
  } catch (err) {
    return {
      availableMethods: [],
      applePayAvailable: null,
      warning:
        err instanceof Error
          ? err.message
          : "Unable to determine available Airwallex payment methods",
    };
  }
}

function getAirwallexEnvByBaseUrl(baseUrl: string): "demo" | "prod" {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "api.airwallex.com" ? "prod" : "demo";
  } catch {
    return "demo";
  }
}

function isMissingOrderTrackingColumnError(message: string): boolean {
  return /payment_started_at|is_recurring_payment/i.test(message);
}

async function insertParentPaymentOrder(
  supabase: ReturnType<typeof getServerSupabase> extends infer T ? Exclude<T, null> : never,
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

async function getOrCreateAirwallexCustomerId({
  airwallexBase,
  accessToken,
  mobile,
  email,
}: {
  airwallexBase: string;
  accessToken: string;
  mobile: string;
  email: string | null;
}) {
  const merchantCustomerId = `parent-${mobile}`;
  const requestId = crypto.randomUUID();
  const createResp = await fetch(`${airwallexBase}/api/v1/pa/customers/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      request_id: requestId,
      merchant_customer_id: merchantCustomerId,
      phone_number: mobile,
      email: email || undefined,
    }),
    cache: "no-store",
  });
  const createBody = await readApiBody(createResp);
  const created = (createBody.json || {}) as AirwallexCustomerCreateResponse;
  const customerId = readString(created.id);
  if (createResp.ok && customerId) {
    return customerId;
  }

  const errorCode = readString(created.code)?.toLowerCase() || "";
  const message = readString(created.message)?.toLowerCase() || "";
  const isAlreadyExists =
    errorCode === "resource_already_exists" ||
    message.includes("already exists");
  if (!isAlreadyExists) {
    throw new Error(
      formatAirwallexError({
        action: "customers/create",
        status: createResp.status,
        body: createBody,
      })
    );
  }

  const listResp = await fetch(
    `${airwallexBase}/api/v1/pa/customers?merchant_customer_id=${encodeURIComponent(
      merchantCustomerId
    )}&page_num=0&page_size=1`,
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
  const listBody = await readApiBody(listResp);
  const listPayload = (listBody.json || {}) as AirwallexCustomerListResponse;
  const existingId = readString(listPayload.items?.[0]?.id);
  if (!listResp.ok || !existingId) {
    throw new Error(
      formatAirwallexError({
        action: "customers/list",
        status: listResp.status,
        body: listBody,
      })
    );
  }
  return existingId;
}

export async function POST(req: Request) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase service role not configured" },
      { status: 503 }
    );
  }

  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mobile = body.mobile_number?.trim() ?? "";
  const paymentMethod = body.payment_method?.trim() || "all";
  const discountCode = body.discount_code?.trim().toUpperCase() || null;

  if (!mobile) {
    return NextResponse.json({ error: "Missing mobile_number" }, { status: 400 });
  }

  const { data: tierData, error: tierErr } = await supabase.rpc("get_parent_tier_status", {
    p_mobile: mobile,
  });
  if (tierErr) {
    return NextResponse.json({ error: tierErr.message }, { status: 500 });
  }
  const tier = (tierData as { is_paid?: boolean } | null)?.is_paid === true;
  if (tier) {
    return NextResponse.json({
      paid: true,
      message: "你已是月費用戶，毋須重複付款。",
    });
  }

  try {
    // Reconcile only older pending orders for paid recovery; do not reuse stale intent links.
    // Client secret and checkout sessions can expire quickly, so always create a fresh intent.
    const PENDING_RECONCILE_MIN_AGE_MS = 30 * 60 * 1000;
    getAirwallexBaseUrl();
    const { data: pendingOrders, error: pendingErr } = await supabase
      .from("parent_payment_orders")
      .select("id,merchant_order_id,airwallex_payment_intent_id,raw_response,created_at")
      .eq("mobile_number", mobile)
      .eq("status", "created")
      .is("finalized_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!pendingErr && Array.isArray(pendingOrders) && pendingOrders.length > 0) {
      for (const rawOrder of pendingOrders as PendingOrderRow[]) {
        const createdAtMs = new Date(rawOrder.created_at).getTime();
        const orderAgeMs = Number.isNaN(createdAtMs) ? 0 : Date.now() - createdAtMs;
        if (orderAgeMs < PENDING_RECONCILE_MIN_AGE_MS) {
          continue;
        }
        const result = await reconcilePendingOrder({
          supabase,
          order: rawOrder,
        });
        if (result.paid) {
          return NextResponse.json({
            paid: true,
            message: "付款成功，帳戶已升級為月費用戶。",
          });
        }
      }
    }
  } catch {
    // If reconciliation check fails, continue normal checkout creation flow.
  }

  let discountPercent = 0;
  let discountCodeApplied: string | null = null;
  if (discountCode) {
    const { data: discountData, error: discountErr } = await supabase.rpc("validate_discount_code", {
      p_code: discountCode,
    });
    if (discountErr) {
      return NextResponse.json({ error: discountErr.message }, { status: 500 });
    }
    const discount = discountData as DiscountResult | null;
    if (!discount?.valid) {
      return NextResponse.json({ error: "折扣碼無效" }, { status: 400 });
    }
    discountPercent = Number(discount.discount_percent || 0);
    discountCodeApplied = discount.code;
  }

  const finalAmount = Math.round(PRICE_HKD * (1 - discountPercent / 100) * 100) / 100;
  const requestedMethods = getAirwallexMethods(paymentMethod);
  const checkoutLocale = getAirwallexCheckoutLocale();
  const merchantOrderId = `GU-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const requestId = crypto.randomUUID();

  const { data: parentRecord } = await supabase
    .from("parents")
    .select("id,email")
    .eq("mobile_number", mobile)
    .maybeSingle();

  if (finalAmount <= 0) {
    const { error: insertErr } = await insertParentPaymentOrder(supabase, {
        parent_id: parentRecord?.id ?? null,
        mobile_number: mobile,
        merchant_order_id: merchantOrderId,
        request_id: requestId,
        amount_hkd: PRICE_HKD,
        discount_code: discountCodeApplied,
        discount_percent: discountPercent,
        final_amount_hkd: 0,
        payment_method: paymentMethod,
        status: "paid",
        payment_started_at: new Date().toISOString(),
        is_recurring_payment: false,
        paid_at: new Date().toISOString(),
        raw_response: { simulated: true, reason: "100_percent_discount" },
      });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const { error: applyErr } = await supabase.rpc("apply_parent_paid_month", {
      p_mobile: mobile,
      p_reference: merchantOrderId,
    });
    if (applyErr) {
      return NextResponse.json({ error: applyErr.message }, { status: 500 });
    }

    return NextResponse.json({
      paid: true,
      message: "已套用100%折扣，帳戶已升級為月費用戶。",
    });
  }

  try {
    const airwallexBase = getAirwallexBaseUrl();
    const airwallexEnv = getAirwallexEnvByBaseUrl(airwallexBase);
    const accessToken = await getAirwallexAccessToken(airwallexBase);
    const methodDiagnostics = await getAirwallexMethodAvailabilityDiagnostics({
      airwallexBase,
      accessToken,
      transactionCurrency: "HKD",
      countryCode: "HK",
      transactionMode: "recurring",
    });
    let applePaySetupWarning: string | null = null;
    if (methodDiagnostics.warning) {
      applePaySetupWarning = `Method diagnostics: ${methodDiagnostics.warning}`;
    }
    if (requestedMethods.includes("applepay")) {
      if (methodDiagnostics.applePayAvailable === false) {
        const unavailableWarning =
          "Apple Pay is not active in Airwallex payment_method_types for HKD/HK recurring checkout.";
        applePaySetupWarning = applePaySetupWarning
          ? `${applePaySetupWarning} ${unavailableWarning}`
          : unavailableWarning;
      }
      try {
        await ensureApplePayCapabilityEnabled({
          airwallexBase,
          accessToken,
        });
        if (shouldRegisterApplePayDomainsForCheckout()) {
          await ensureApplePayActivated({
            req,
            airwallexBase,
            accessToken,
          });
        }
      } catch (applePayErr) {
        const activationWarning =
          applePayErr instanceof Error
            ? applePayErr.message
            : "Apple Pay activation check failed";
        applePaySetupWarning = applePaySetupWarning
          ? `${applePaySetupWarning} ${activationWarning}`
          : activationWarning;
      }
    }
    const customerId = await getOrCreateAirwallexCustomerId({
      airwallexBase,
      accessToken,
      mobile,
      email: readString(parentRecord?.email),
    });
    const recurringTerms = {
      payment_amount_type: "FIXED",
      fixed_payment_amount: finalAmount,
      payment_currency: "HKD",
      payment_schedule: {
        period: 1,
        period_unit: "MONTH",
      },
      billing_cycle_charge_day: new Date().getUTCDate(),
      total_billing_cycles: null,
    };
    const createIntentRes = await fetch(`${airwallexBase}/api/v1/pa/payment_intents/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        amount: finalAmount,
        currency: "HKD",
        merchant_order_id: merchantOrderId,
        request_id: requestId,
        customer_id: customerId,
        payment_consent: {
          next_triggered_by: "merchant",
          merchant_trigger_reason: "scheduled",
          terms_of_use: recurringTerms,
        },
        metadata: {
          merchant_order_id: merchantOrderId,
          request_id: requestId,
          mobile_number: mobile,
          payment_method: paymentMethod,
          discount_code: discountCodeApplied,
          applepay_setup_warning: applePaySetupWarning,
          recurring_type: "monthly",
          recurring_enabled: true,
        },
      }),
      cache: "no-store",
    });
    const createIntentBody = await readApiBody(createIntentRes);
    const createIntentPayload = (createIntentBody.json || {}) as {
      id?: string;
      client_secret?: string;
    };
    if (!createIntentRes.ok || !createIntentPayload.id || !createIntentPayload.client_secret) {
      throw new Error(
        formatAirwallexError({
          action: "payment_intents/create",
          status: createIntentRes.status,
          body: createIntentBody,
        })
      );
    }

    const resolvedIntentId = createIntentPayload.id;
    const checkoutPayload = {
      flow: "intent_recurring",
      mode: "recurring",
      submitType: "subscribe",
      locale: checkoutLocale,
      customer_id: customerId,
      recurring: {
        next_triggered_by: "merchant",
        merchant_trigger_reason: "scheduled",
        terms_of_use: recurringTerms,
      },
      intent: createIntentPayload,
      payment_method: paymentMethod,
      methods: requestedMethods,
      currency: "HKD",
      country_code: "HK",
    };

    const { error: insertErr } = await insertParentPaymentOrder(supabase, {
        parent_id: parentRecord?.id ?? null,
        mobile_number: mobile,
        merchant_order_id: merchantOrderId,
        request_id: requestId,
        amount_hkd: PRICE_HKD,
        discount_code: discountCodeApplied,
        discount_percent: discountPercent,
        final_amount_hkd: finalAmount,
        payment_method: paymentMethod,
        status: "created",
        payment_started_at: new Date().toISOString(),
        is_recurring_payment: true,
        airwallex_customer_id: customerId,
        airwallex_payment_intent_id: resolvedIntentId,
        raw_response: {
          checkout: checkoutPayload,
        },
      });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      intent_id: resolvedIntentId,
      client_secret: createIntentPayload.client_secret,
      payment_method: paymentMethod,
      methods: requestedMethods,
      currency: "HKD",
      country_code: "HK",
      final_amount_hkd: finalAmount,
      airwallex_customer_id: customerId,
      airwallex_env: airwallexEnv,
      airwallex_locale: checkoutLocale,
      airwallex_available_methods: methodDiagnostics.availableMethods,
      applepay_available: methodDiagnostics.applePayAvailable,
      applepay_setup_warning: applePaySetupWarning,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to initialize payment" },
      { status: 500 }
    );
  }
}
