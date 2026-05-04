import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const AIRWALLEX_BASE = process.env.AIRWALLEX_BASE_URL?.trim() || "https://api-demo.airwallex.com";
const PRICE_HKD = 99;
const AIRWALLEX_METHOD_MAP: Record<string, string[]> = {
  cards: ["card"],
  apple_pay: ["applepay"],
  google_pay: ["googlepay"],
  alipay: ["alipaycn", "alipayhk"],
  wechat_pay: ["wechatpay"],
};

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

function getServerSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

async function getAirwallexAccessToken() {
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

  const res = await fetch(`${AIRWALLEX_BASE}/api/v1/authentication/login`, {
    method: "POST",
    headers,
    cache: "no-store",
  });
  const payload = (await res.json()) as { token?: string; message?: string };
  if (!res.ok || !payload.token) {
    throw new Error(payload.message || "Failed to authenticate with Airwallex");
  }
  return payload.token;
}

function getBaseAppUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const origin =
    req.headers.get("origin") ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return origin.replace(/\/$/, "");
}

function getAirwallexMethods(paymentMethod: string): string[] {
  return AIRWALLEX_METHOD_MAP[paymentMethod] ?? ["card"];
}

function buildHostedCheckoutFallbackUrl({
  appBaseUrl,
  intentId,
  clientSecret,
  mobile,
  paymentMethod,
}: {
  appBaseUrl: string;
  intentId: string;
  clientSecret: string;
  mobile: string;
  paymentMethod: string;
}) {
  const params = new URLSearchParams({
    intent_id: intentId,
    client_secret: clientSecret,
    mobile,
    payment_method: paymentMethod,
    currency: "HKD",
    country_code: "HK",
  });
  return `${appBaseUrl}/payment-airwallex?${params.toString()}`;
}

export async function POST(req: NextRequest) {
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
  const paymentMethod = body.payment_method?.trim() || "cards";
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
  const merchantOrderId = `GU-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const requestId = crypto.randomUUID();

  const { data: parentRecord } = await supabase
    .from("parents")
    .select("id")
    .eq("mobile_number", mobile)
    .maybeSingle();

  if (finalAmount <= 0) {
    const { error: insertErr } = await supabase
      .from("parent_payment_orders")
      .insert({
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
    const accessToken = await getAirwallexAccessToken();
    const appBaseUrl = getBaseAppUrl(req);
    const callbackBase =
      `${appBaseUrl}/payment-callback?mobile=${encodeURIComponent(mobile)}` +
      `&order_id=${encodeURIComponent(merchantOrderId)}`;
    const pendingReturnUrl = `${callbackBase}&result=pending`;
    const createIntentRes = await fetch(`${AIRWALLEX_BASE}/api/v1/pa/payment_intents/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: finalAmount,
        currency: "HKD",
        merchant_order_id: merchantOrderId,
        request_id: requestId,
        return_url: pendingReturnUrl,
        metadata: {
          mobile_number: mobile,
          payment_method: paymentMethod,
          discount_code: discountCodeApplied,
        },
      }),
      cache: "no-store",
    });

    const createIntentPayload = (await createIntentRes.json()) as {
      id?: string;
      client_secret?: string;
      message?: string;
    };
    if (!createIntentRes.ok || !createIntentPayload.id || !createIntentPayload.client_secret) {
      throw new Error(createIntentPayload.message || "Failed to create Airwallex payment intent");
    }
    const resolvedSuccessUrl =
      `${callbackBase}&result=success&intent_id=${encodeURIComponent(createIntentPayload.id)}`;
    const resolvedCancelUrl =
      `${callbackBase}&result=cancel&intent_id=${encodeURIComponent(createIntentPayload.id)}`;
    const resolvedFailUrl =
      `${callbackBase}&result=failed&intent_id=${encodeURIComponent(createIntentPayload.id)}`;

    let checkoutPayload: Record<string, unknown> = {};
    let checkoutUrl: string | null = null;
    try {
      const checkoutRes = await fetch(`${AIRWALLEX_BASE}/api/v1/pa/payment_links/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "GearUp 月費會員",
          reusable: false,
          payment_intent_id: createIntentPayload.id,
          success_url: resolvedSuccessUrl,
          fail_url: resolvedFailUrl,
          cancel_url: resolvedCancelUrl,
          methods: getAirwallexMethods(paymentMethod),
        }),
        cache: "no-store",
      });

      checkoutPayload = (await checkoutRes.json()) as Record<string, unknown>;
      if (checkoutRes.ok) {
        const rawUrl =
          (checkoutPayload.url as string | undefined) ||
          (checkoutPayload.hosted_payment_url as string | undefined);
        if (rawUrl) checkoutUrl = rawUrl;
      }
    } catch {
      // fallback handled below
    }

    if (!checkoutUrl) {
      checkoutUrl = buildHostedCheckoutFallbackUrl({
        appBaseUrl,
        intentId: createIntentPayload.id,
        clientSecret: createIntentPayload.client_secret,
        mobile,
        paymentMethod,
      });
      checkoutPayload = {
        ...checkoutPayload,
        fallback: "payment-airwallex-page",
      };
    }

    const { error: insertErr } = await supabase
      .from("parent_payment_orders")
      .insert({
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
        airwallex_payment_intent_id: createIntentPayload.id,
        raw_response: {
          intent: createIntentPayload,
          checkout: checkoutPayload,
          success_url: resolvedSuccessUrl,
          cancel_url: resolvedCancelUrl,
          fail_url: resolvedFailUrl,
        },
      });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      checkout_url: checkoutUrl,
      intent_id: createIntentPayload.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to initialize payment" },
      { status: 500 }
    );
  }
}
