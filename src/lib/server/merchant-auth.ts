import { createHmac, scryptSync, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const MERCHANT_COOKIE = "mer_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const USERNAME = "91917838";
/** scrypt hash only. Password reset is a code change in this module, not a self-service screen. */
const PASSWORD_HASH =
  "scrypt$e902c8b357c115002929f7dff655b454$c8497af4c702e526dc1b3af1e17c5f63b9793a696ee0759f2a3128ef2fe8d087eb3cd2372277fbeed01165710403a2c632d5fb2fa69a5ef6ea63604a882bde1a";

type SessionPayload = {
  sub: string;
  exp: number;
};

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}

function fromBase64Url(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}

function sessionSecret(): string {
  const value =
    process.env.MERCHANT_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "";
  if (!value) throw new Error("Missing MERCHANT_SESSION_SECRET or ADMIN_SESSION_SECRET");
  return value;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", sessionSecret()).update(payloadB64).digest("base64url");
}

export function merchantPasswordHash(): string {
  return PASSWORD_HASH;
}

export function verifyMerchantPassword(password: string, storedHash = PASSWORD_HASH): boolean {
  const [prefix, salt, digest] = String(storedHash || "").split("$");
  if (prefix !== "scrypt" || !salt || !digest) return false;
  const actualDigest = scryptSync(password, salt, 64).toString("hex");
  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(actualDigest, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function verifyMerchantLogin(username: string, password: string): boolean {
  const given = Buffer.from(username);
  const expected = Buffer.from(USERNAME);
  if (given.length !== expected.length) return false;
  const userOk = timingSafeEqual(given, expected);
  return userOk && verifyMerchantPassword(password);
}

export function createMerchantSessionToken(): string {
  const payload: SessionPayload = {
    sub: USERNAME,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function parseMerchantSessionToken(token: string): SessionPayload | null {
  const [payloadB64, providedSig] = token.split(".");
  if (!payloadB64 || !providedSig) return null;
  const expectedSig = sign(payloadB64);
  const provided = Buffer.from(providedSig);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(payloadB64)) as SessionPayload;
    if (payload?.sub !== USERNAME || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getMerchantSession(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(MERCHANT_COOKIE)?.value || "";
  if (!token) return null;
  return parseMerchantSessionToken(token);
}

export function setMerchantSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: MERCHANT_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearMerchantSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: MERCHANT_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}
