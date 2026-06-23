import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const TUTOR_SESSION_COOKIE = "tutor_session";
const TUTOR_SESSION_TTL_SECONDS = 60 * 60 * 8;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;
const DEFAULT_TUTOR_PASSWORD = "123456";
const PASSWORD_HASH_PREFIX = "scrypt";

type TutorSessionPayload = {
  code_id: string;
  code: string;
  exp: number;
};

type ActiveTutorProfile = {
  codeId: string;
  code: string;
  tutorName: string;
  accountId: string;
  usernameCode: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
};

function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}

function fromBase64Url(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}

function getSessionSecret(): string {
  const value =
    process.env.TUTOR_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "";
  if (!value) {
    throw new Error("Missing TUTOR_SESSION_SECRET (or ADMIN_SESSION_SECRET fallback).");
  }
  return value;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
}

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function isLocked(lockedUntilIso: string | null): boolean {
  if (!lockedUntilIso) return false;
  const lockedUntilMs = new Date(lockedUntilIso).getTime();
  if (!Number.isFinite(lockedUntilMs)) return false;
  return lockedUntilMs > Date.now();
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${PASSWORD_HASH_PREFIX}$${salt}$${digest}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [prefix, salt, digest] = String(storedHash || "").split("$");
  if (!prefix || !salt || !digest || prefix !== PASSWORD_HASH_PREFIX) return false;
  const actualDigest = scryptSync(password, salt, 64).toString("hex");
  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(actualDigest, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function createSessionToken(payload: { codeId: string; code: string }): string {
  const body: TutorSessionPayload = {
    code_id: payload.codeId,
    code: payload.code,
    exp: Math.floor(Date.now() / 1000) + TUTOR_SESSION_TTL_SECONDS,
  };
  const payloadB64 = toBase64Url(JSON.stringify(body));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

function parseSessionToken(token: string): TutorSessionPayload | null {
  const [payloadB64, providedSig] = token.split(".");
  if (!payloadB64 || !providedSig) return null;
  const expectedSig = sign(payloadB64);
  const provided = Buffer.from(providedSig);
  const expected = Buffer.from(expectedSig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  try {
    const payload = JSON.parse(fromBase64Url(payloadB64)) as TutorSessionPayload;
    if (!payload?.code_id || !payload?.code || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getSessionToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  return (
    req.cookies.get(TUTOR_SESSION_COOKIE)?.value ||
    req.headers.get("x-tutor-session")?.trim() ||
    bearerToken ||
    ""
  );
}

async function loadTutorProfileByCodeId({
  codeId,
  code,
}: {
  codeId: string;
  code: string;
}): Promise<ActiveTutorProfile | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data: codeRow, error: codeErr } = await admin
    .from("tutor_referral_codes")
    .select("id,code,tutor_name,is_active")
    .eq("id", codeId)
    .maybeSingle();
  if (codeErr || !codeRow) return null;
  if (!Boolean(codeRow.is_active) || String(codeRow.code ?? "") !== code) return null;

  const { data: accountRow, error: accountErr } = await admin
    .from("tutor_portal_accounts")
    .select(
      "id,code_id,username_code,password_hash,must_change_password,failed_attempts,locked_until,is_active"
    )
    .eq("code_id", codeId)
    .eq("is_active", true)
    .maybeSingle();
  if (accountErr || !accountRow) return null;

  return {
    codeId: String(codeRow.id),
    code: String(codeRow.code),
    tutorName: String(codeRow.tutor_name ?? ""),
    accountId: String(accountRow.id ?? ""),
    usernameCode: String(accountRow.username_code ?? ""),
    mustChangePassword: Boolean(accountRow.must_change_password),
    failedAttempts: Number(accountRow.failed_attempts ?? 0),
    lockedUntil: accountRow.locked_until ? String(accountRow.locked_until) : null,
  };
}

async function ensureTutorAccountForCode({
  codeId,
  code,
}: {
  codeId: string;
  code: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");

  const existingRes = await admin
    .from("tutor_portal_accounts")
    .select(
      "id,code_id,username_code,password_hash,must_change_password,failed_attempts,locked_until,is_active"
    )
    .eq("code_id", codeId)
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;
  if (existingRes.data) return existingRes.data;

  const insertRes = await admin
    .from("tutor_portal_accounts")
    .insert({
      code_id: codeId,
      username_code: code,
      password_hash: hashPassword(DEFAULT_TUTOR_PASSWORD),
      must_change_password: true,
      failed_attempts: 0,
      is_active: true,
      locked_until: null,
    })
    .select(
      "id,code_id,username_code,password_hash,must_change_password,failed_attempts,locked_until,is_active"
    )
    .maybeSingle();
  if (insertRes.error) {
    const retry = await admin
      .from("tutor_portal_accounts")
      .select(
        "id,code_id,username_code,password_hash,must_change_password,failed_attempts,locked_until,is_active"
      )
      .eq("code_id", codeId)
      .maybeSingle();
    if (retry.error) throw retry.error;
    if (!retry.data) throw insertRes.error;
    return retry.data;
  }
  if (!insertRes.data) throw new Error("Unable to create tutor portal account.");
  return insertRes.data;
}

async function incrementFailedAttempts({
  accountId,
  currentAttempts,
}: {
  accountId: string;
  currentAttempts: number;
}): Promise<{ locked: boolean; lockedUntil: string | null }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");

  const attempts = currentAttempts + 1;
  const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;
  const lockedUntil = shouldLock ? addMinutes(new Date(), LOCKOUT_MINUTES).toISOString() : null;

  const updateRes = await admin
    .from("tutor_portal_accounts")
    .update({
      failed_attempts: attempts,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (updateRes.error) throw updateRes.error;

  return { locked: shouldLock, lockedUntil };
}

async function resetFailedAttempts(accountId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const updateRes = await admin
    .from("tutor_portal_accounts")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (updateRes.error) throw updateRes.error;
}

async function updatePassword({
  accountId,
  newPassword,
}: {
  accountId: string;
  newPassword: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const updateRes = await admin
    .from("tutor_portal_accounts")
    .update({
      password_hash: hashPassword(newPassword),
      must_change_password: false,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);
  if (updateRes.error) throw updateRes.error;
}

export function setTutorSessionCookie(res: NextResponse, token: string) {
  res.cookies.set({
    name: TUTOR_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TUTOR_SESSION_TTL_SECONDS,
  });
}

export function clearTutorSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: TUTOR_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

export async function getTutorSession(req: NextRequest) {
  const token = getSessionToken(req);
  if (!token) return null;
  const parsed = parseSessionToken(token);
  if (!parsed) return null;
  const profile = await loadTutorProfileByCodeId({
    codeId: parsed.code_id,
    code: parsed.code,
  });
  if (!profile) return null;
  return profile;
}

export async function requireTutorSession(
  req: NextRequest,
  opts: { requirePasswordChanged?: boolean } = {}
) {
  const profile = await getTutorSession(req);
  if (!profile) {
    const res = NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
    clearTutorSessionCookie(res);
    return { profile: null, response: res };
  }
  if (isLocked(profile.lockedUntil)) {
    const res = NextResponse.json(
      { error: "帳戶已暫時鎖定，請聯絡管理員。", locked_until: profile.lockedUntil },
      { status: 423 }
    );
    return { profile: null, response: res };
  }
  if (opts.requirePasswordChanged && profile.mustChangePassword) {
    const res = NextResponse.json(
      { error: "請先更新密碼後再使用此功能。", must_change_password: true },
      { status: 403 }
    );
    return { profile: null, response: res };
  }
  return { profile, response: null };
}

export async function loginTutor({
  code,
  password,
}: {
  code: string;
  password: string;
}): Promise<
  | {
      ok: true;
      token: string;
      code: string;
      mustChangePassword: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
      lockedUntil?: string | null;
    }
> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, status: 503, error: "系統未配置 Supabase 管理金鑰。" };
  }

  const codeRes = await admin
    .from("tutor_referral_codes")
    .select("id,code,is_active")
    .eq("code", code)
    .maybeSingle();
  if (codeRes.error || !codeRes.data) {
    return { ok: false, status: 401, error: "帳號或密碼錯誤。" };
  }
  if (!Boolean(codeRes.data.is_active)) {
    return { ok: false, status: 403, error: "此教師編號未啟用，請聯絡管理員。" };
  }

  const account = await ensureTutorAccountForCode({
    codeId: String(codeRes.data.id),
    code: String(codeRes.data.code),
  });
  if (!Boolean(account.is_active)) {
    return { ok: false, status: 403, error: "此導師帳戶已停用，請聯絡管理員。" };
  }

  const lockedUntil = account.locked_until ? String(account.locked_until) : null;
  if (isLocked(lockedUntil)) {
    return {
      ok: false,
      status: 423,
      error: "登入錯誤已達上限，帳戶暫時鎖定，請聯絡管理員。",
      lockedUntil,
    };
  }

  const passwordHash = String(account.password_hash ?? "");
  if (!verifyPassword(password, passwordHash)) {
    const failedAttempts = Number(account.failed_attempts ?? 0);
    const lockResult = await incrementFailedAttempts({
      accountId: String(account.id),
      currentAttempts: failedAttempts,
    });
    if (lockResult.locked) {
      return {
        ok: false,
        status: 423,
        error: "登入錯誤已達 5 次，帳戶已暫時鎖定，請聯絡管理員。",
        lockedUntil: lockResult.lockedUntil,
      };
    }
    return { ok: false, status: 401, error: "帳號或密碼錯誤。" };
  }

  await resetFailedAttempts(String(account.id));
  const token = createSessionToken({
    codeId: String(codeRes.data.id),
    code: String(codeRes.data.code),
  });
  return {
    ok: true,
    token,
    code: String(codeRes.data.code),
    mustChangePassword: Boolean(account.must_change_password),
  };
}

export async function changeTutorPassword({
  req,
  currentPassword,
  newPassword,
}: {
  req: NextRequest;
  currentPassword: string;
  newPassword: string;
}): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  const sessionRes = await requireTutorSession(req);
  if (sessionRes.response || !sessionRes.profile) {
    return {
      ok: false,
      status: sessionRes.response?.status ?? 401,
      error: "未登入導師帳戶",
    };
  }
  const profile = sessionRes.profile;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, status: 503, error: "系統未配置 Supabase 管理金鑰。" };
  }

  const accountRes = await admin
    .from("tutor_portal_accounts")
    .select("id,password_hash")
    .eq("id", profile.accountId)
    .maybeSingle();
  if (accountRes.error || !accountRes.data) {
    return { ok: false, status: 401, error: "導師帳戶不存在或已失效。" };
  }

  if (!verifyPassword(currentPassword, String(accountRes.data.password_hash ?? ""))) {
    return { ok: false, status: 401, error: "目前密碼不正確。" };
  }

  if (newPassword.length < 6) {
    return { ok: false, status: 400, error: "新密碼最少 6 個字元。" };
  }
  if (newPassword.length > 72) {
    return { ok: false, status: 400, error: "新密碼過長，請控制在 72 個字元內。" };
  }

  await updatePassword({
    accountId: profile.accountId,
    newPassword,
  });

  return { ok: true };
}

export async function resetTutorPasswordByCodeForAdmin({
  code,
}: {
  code: string;
}): Promise<
  | {
      ok: true;
      code: string;
      tutorName: string;
      isActiveCode: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, status: 503, error: "系統未配置 Supabase 管理金鑰。" };
  }

  const normalizedCode = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return { ok: false, status: 400, error: "教師編號必須為 6 位數字" };
  }

  const codeRes = await admin
    .from("tutor_referral_codes")
    .select("id,code,tutor_name,is_active")
    .eq("code", normalizedCode)
    .maybeSingle();
  if (codeRes.error) {
    throw codeRes.error;
  }
  if (!codeRes.data) {
    return { ok: false, status: 404, error: "找不到此教師編號" };
  }

  const account = await ensureTutorAccountForCode({
    codeId: String(codeRes.data.id),
    code: String(codeRes.data.code),
  });

  const resetRes = await admin
    .from("tutor_portal_accounts")
    .update({
      password_hash: hashPassword(DEFAULT_TUTOR_PASSWORD),
      must_change_password: true,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(account.id));
  if (resetRes.error) {
    throw resetRes.error;
  }

  return {
    ok: true,
    code: String(codeRes.data.code),
    tutorName: String(codeRes.data.tutor_name ?? ""),
    isActiveCode: Boolean(codeRes.data.is_active),
  };
}
