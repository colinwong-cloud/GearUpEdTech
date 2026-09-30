export const ADMIN_ASSIGNED_USAGE_LIMIT = 50;
export const SELF_REGISTRATION_USAGE_LIMIT = 1_000_000;
export const TUTOR_PASSWORD_MIN_LENGTH = 6;
export const TUTOR_PASSWORD_MAX_LENGTH = 72;
export const TUTOR_NAME_MAX_LENGTH = 80;

const TUTOR_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const ONE_TIME_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type TutorRegistrationSource = "admin" | "self";

export type NormalizedTutorContact = {
  tutorName: string;
  tutorMobile: string;
  tutorEmail: string;
};

export function tutorPasswordError(password: string): string | null {
  if (password.length < TUTOR_PASSWORD_MIN_LENGTH) return "密碼最少 6 個字元。";
  if (password.length > TUTOR_PASSWORD_MAX_LENGTH) return "密碼過長，請控制在 72 個字元內。";
  return null;
}

export function normalizeTutorContact(input: {
  tutorName: string;
  tutorMobile: string;
  tutorEmail: string;
  emailRequired: boolean;
}): { ok: true; value: NormalizedTutorContact } | { ok: false; error: string } {
  const tutorName = input.tutorName.trim();
  const tutorMobile = input.tutorMobile.replace(/\D/g, "");
  const tutorEmail = input.tutorEmail.trim().toLowerCase();

  if (!tutorName) return { ok: false, error: "請輸入導師姓名。" };
  if (tutorName.length > TUTOR_NAME_MAX_LENGTH) {
    return { ok: false, error: "導師姓名過長。" };
  }
  if (!/^\d{8}$/.test(tutorMobile)) return { ok: false, error: "請輸入 8 位數字手機。" };
  if (!tutorEmail && input.emailRequired) return { ok: false, error: "請輸入電郵。" };
  if (tutorEmail && !TUTOR_EMAIL_RE.test(tutorEmail)) {
    return { ok: false, error: "電郵格式不正確。" };
  }

  return {
    ok: true,
    value: {
      tutorName,
      tutorMobile,
      tutorEmail,
    },
  };
}

export function buildTutorCode(nextInt: (exclusiveMax: number) => number): string {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += String(nextInt(10));
  }
  return code;
}

export function buildOneTimeTutorPassword(nextInt: (exclusiveMax: number) => number): string {
  let password = "";
  for (let index = 0; index < 10; index += 1) {
    password += ONE_TIME_PASSWORD_ALPHABET[nextInt(ONE_TIME_PASSWORD_ALPHABET.length)];
  }
  return password;
}

export function formatTutorUsageCount(currentUses: number, usageLimit: number): string {
  if (usageLimit >= SELF_REGISTRATION_USAGE_LIMIT) return `${currentUses}（不設上限）`;
  return `${currentUses} / ${usageLimit}`;
}

export function tutorRegistrationSourceLabel(source: string | null | undefined): string {
  return source === "self" ? "自行登記" : "管理員指派";
}
