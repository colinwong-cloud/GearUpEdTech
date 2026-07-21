import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

export const runtime = "nodejs";

type AccessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

type JsApiTicketResponse = {
  ticket?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

type CacheEntry = {
  value: string;
  expiresAtMs: number;
};

let accessTokenCache: CacheEntry | null = null;
let jsApiTicketCache: CacheEntry | null = null;

function getWechatCredentials() {
  const appId =
    process.env.WECHAT_OA_APP_ID?.trim() ||
    process.env.WECHAT_APP_ID?.trim() ||
    "";
  const appSecret =
    process.env.WECHAT_OA_APP_SECRET?.trim() ||
    process.env.WECHAT_APP_SECRET?.trim() ||
    "";
  return { appId, appSecret };
}

function nowMs(): number {
  return Date.now();
}

function isValidCache(entry: CacheEntry | null): entry is CacheEntry {
  return Boolean(entry && entry.expiresAtMs > nowMs() + 30_000);
}

function sanitizeShareUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Missing url");
  }
  const parsed = new URL(raw.trim());
  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("Invalid protocol");
  }
  parsed.hash = "";
  return parsed.toString();
}

function createNonceStr(): string {
  return randomBytes(8).toString("hex");
}

function sha1(input: string): string {
  return createHash("sha1").update(input, "utf8").digest("hex");
}

async function fetchAccessToken(appId: string, appSecret: string): Promise<string> {
  if (isValidCache(accessTokenCache)) {
    return accessTokenCache.value;
  }
  const tokenUrl = new URL("https://api.weixin.qq.com/cgi-bin/token");
  tokenUrl.searchParams.set("grant_type", "client_credential");
  tokenUrl.searchParams.set("appid", appId);
  tokenUrl.searchParams.set("secret", appSecret);

  const response = await fetch(tokenUrl.toString(), { cache: "no-store" });
  const payload = (await response.json()) as AccessTokenResponse;
  if (!response.ok || payload.errcode || !payload.access_token || !payload.expires_in) {
    throw new Error(`WeChat access token error: ${payload.errmsg || response.statusText}`);
  }
  accessTokenCache = {
    value: payload.access_token,
    expiresAtMs: nowMs() + Math.max(payload.expires_in - 60, 60) * 1000,
  };
  return payload.access_token;
}

async function fetchJsApiTicket(accessToken: string): Promise<string> {
  if (isValidCache(jsApiTicketCache)) {
    return jsApiTicketCache.value;
  }
  const ticketUrl = new URL("https://api.weixin.qq.com/cgi-bin/ticket/getticket");
  ticketUrl.searchParams.set("access_token", accessToken);
  ticketUrl.searchParams.set("type", "jsapi");
  const response = await fetch(ticketUrl.toString(), { cache: "no-store" });
  const payload = (await response.json()) as JsApiTicketResponse;
  if (!response.ok || payload.errcode || !payload.ticket || !payload.expires_in) {
    throw new Error(`WeChat jsapi ticket error: ${payload.errmsg || response.statusText}`);
  }
  jsApiTicketCache = {
    value: payload.ticket,
    expiresAtMs: nowMs() + Math.max(payload.expires_in - 60, 60) * 1000,
  };
  return payload.ticket;
}

export async function POST(req: NextRequest) {
  const { appId, appSecret } = getWechatCredentials();
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "WeChat share credentials are not configured" },
      { status: 503 }
    );
  }

  let sanitizedUrl: string;
  try {
    const body = (await req.json()) as { url?: unknown };
    sanitizedUrl = sanitizeShareUrl(body.url);
  } catch {
    return NextResponse.json({ error: "Invalid url payload" }, { status: 400 });
  }

  try {
    const accessToken = await fetchAccessToken(appId, appSecret);
    const jsApiTicket = await fetchJsApiTicket(accessToken);
    const timestamp = Math.floor(nowMs() / 1000);
    const nonceStr = createNonceStr();
    const signatureInput = `jsapi_ticket=${jsApiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${sanitizedUrl}`;
    const signature = sha1(signatureInput);

    return NextResponse.json({
      appId,
      timestamp,
      nonceStr,
      signature,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to build WeChat share config" },
      { status: 502 }
    );
  }
}
