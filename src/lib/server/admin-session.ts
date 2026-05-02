import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

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

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function getSessionSecret(): string {
  return getRequiredEnv("ADMIN_SESSION_SECRET");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSessionSecret()).update(payloadB64).digest("base64url");
}

export function verifyAdminCredentials(user: string, pass: string): boolean {
  const expectedUser = getRequiredEnv("ADMIN_CONSOLE_USER");
  const expectedPass = getRequiredEnv("ADMIN_CONSOLE_PASS");
  return user === expectedUser && pass === expectedPass;
}

export function createAdminSessionToken(subject: string): string {
  const payload: SessionPayload = {
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function parseAdminSessionToken(token: string): SessionPayload | null {
  const [payloadB64, providedSig] = token.split(".");
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = sign(payloadB64);
  const provided = Buffer.from(providedSig);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadB64)) as SessionPayload;
    if (!payload?.sub || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAdminSession(req: NextRequest): SessionPayload | null {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const headerToken = req.headers.get("x-admin-session")?.trim() ?? "";
  const token =
    req.cookies.get(ADMIN_COOKIE)?.value ||
    bearerToken ||
    headerToken;
  if (!token) return null;
  return parseAdminSessionToken(token);
}

export function requireAdminSession(req: NextRequest): SessionPayload | null {
  return getAdminSession(req);
}

export function setAdminSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAdminSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}
