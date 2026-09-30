import { randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  SELF_REGISTRATION_USAGE_LIMIT,
  buildOneTimeTutorPassword,
  buildTutorCode,
  normalizeTutorContact,
} from "@/lib/tutor-registration";
import { provisionTutorPortalAccount } from "@/lib/server/tutor-session";
import { verifyTurnstileToken } from "@/lib/server/turnstile";

const CODE_ATTEMPTS = 8;

export const TUTOR_SELF_REGISTRATION_HINT =
  "缺少導師自行登記欄位，請先在 Supabase 執行 supabase_tutor_self_registration.sql。";

type RegisterTutorInput = {
  tutorName: string;
  tutorMobile: string;
  tutorEmail: string;
  turnstileToken: string;
  remoteIp?: string | null;
};

export type RegisterTutorResult =
  | {
      ok: true;
      code: string;
      temporaryPassword: string;
      emailSent: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isMissingRegistrationColumn(message: string): boolean {
  return /registration_source/i.test(message);
}

async function sendWelcomeEmail({
  tutorName,
  tutorEmail,
  code,
  temporaryPassword,
}: {
  tutorName: string;
  tutorEmail: string;
  code: string;
  temporaryPassword: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  if (!apiKey) return false;
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "GearUp Quiz <noreply@updates.hkedutech.com>",
    to: tutorEmail,
    subject: "GearUp 導師帳戶已建立",
    html: `
      <p>${escapeHtml(tutorName)}，你好。</p>
      <p>你的教師編號是 <strong>${escapeHtml(code)}</strong>。</p>
      <p>首次登入密碼是 <strong>${escapeHtml(temporaryPassword)}</strong>。</p>
      <p>請到 <a href="https://www.gearupquiz.com/tutor">https://www.gearupquiz.com/tutor</a> 登入，並立即更新密碼。</p>
      <p>學生註冊時請填寫此教師編號。</p>
      <p>此電郵由系統自動寄出。</p>
    `,
  });
  return !error;
}

export async function registerTutor(input: RegisterTutorInput): Promise<RegisterTutorResult> {
  const contact = normalizeTutorContact({
    tutorName: input.tutorName,
    tutorMobile: input.tutorMobile,
    tutorEmail: input.tutorEmail,
    emailRequired: true,
  });
  if (!contact.ok) return { ok: false, status: 400, error: contact.error };
  if (!contact.value.tutorEmail) return { ok: false, status: 400, error: "請輸入電郵。" };

  const turnstile = await verifyTurnstileToken(input.turnstileToken, input.remoteIp);
  if (!turnstile.ok) return turnstile;

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, status: 503, error: "系統未配置 Supabase 管理金鑰。" };

  const mobileOwner = await admin
    .from("tutor_referral_codes")
    .select("id")
    .eq("tutor_mobile", contact.value.tutorMobile)
    .eq("is_active", true)
    .limit(1);
  if (mobileOwner.error) throw mobileOwner.error;
  if ((mobileOwner.data ?? []).length > 0) {
    return { ok: false, status: 409, error: "此手機已有啟用中的教師編號。" };
  }

  const emailOwner = await admin
    .from("tutor_referral_codes")
    .select("id")
    .eq("is_active", true)
    .ilike("tutor_email", contact.value.tutorEmail)
    .limit(1);
  if (emailOwner.error) throw emailOwner.error;
  if ((emailOwner.data ?? []).length > 0) {
    return { ok: false, status: 409, error: "此電郵已有啟用中的教師編號。" };
  }

  const temporaryPassword = buildOneTimeTutorPassword((max) => randomInt(max));
  let created: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = buildTutorCode((max) => randomInt(max));
    const insertRes = await admin
      .from("tutor_referral_codes")
      .insert({
        code,
        tutor_name: contact.value.tutorName,
        tutor_mobile: contact.value.tutorMobile,
        tutor_email: contact.value.tutorEmail,
        usage_limit: SELF_REGISTRATION_USAGE_LIMIT,
        current_uses: 0,
        is_active: true,
        registration_source: "self",
      })
      .select("id,code")
      .maybeSingle();
    if (!insertRes.error && insertRes.data) {
      created = { id: String(insertRes.data.id), code: String(insertRes.data.code) };
      break;
    }
    const message = insertRes.error?.message || "";
    if (isMissingRegistrationColumn(message) && /registration_source/i.test(message)) {
      return { ok: false, status: 503, error: TUTOR_SELF_REGISTRATION_HINT };
    }
    if (/uq_tutor_referral_codes_active_mobile|tutor_mobile/i.test(message)) {
      return { ok: false, status: 409, error: "此手機已有啟用中的教師編號。" };
    }
    if (/uq_tutor_referral_codes_active_email|tutor_email/i.test(message)) {
      return { ok: false, status: 409, error: "此電郵已有啟用中的教師編號。" };
    }
    if (/duplicate key|unique/i.test(message) && /code/i.test(message)) continue;
    if (insertRes.error) throw insertRes.error;
  }
  if (!created) return { ok: false, status: 503, error: "暫時未能分配教師編號，請再試一次。" };

  try {
    await provisionTutorPortalAccount({
      codeId: created.id,
      code: created.code,
      password: temporaryPassword,
    });
  } catch (error) {
    await admin.from("tutor_referral_codes").delete().eq("id", created.id);
    const message = error instanceof Error ? error.message : "";
    if (/tutor_portal_accounts|42P01|42703|does not exist/i.test(message)) {
      return {
        ok: false,
        status: 503,
        error: "缺少導師入口資料表，請先在 Supabase 執行 supabase_tutor_portal_auth.sql。",
      };
    }
    throw error;
  }

  let emailSent = false;
  try {
    emailSent = await sendWelcomeEmail({
      tutorName: contact.value.tutorName,
      tutorEmail: contact.value.tutorEmail,
      code: created.code,
      temporaryPassword,
    });
  } catch {
    emailSent = false;
  }

  return {
    ok: true,
    code: created.code,
    temporaryPassword,
    emailSent,
  };
}
