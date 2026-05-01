/**
 * Supabase project URL for public Storage paths.
 * Prefer NEXT_PUBLIC_* (works on client). On the server, falls back to SUPABASE_URL
 * when teams only set the non-public env in Vercel.
 */
function supabaseProjectOrigin(): string {
  const pub = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (pub) return pub;
  if (typeof window === "undefined" && process.env.SUPABASE_URL) {
    return process.env.SUPABASE_URL.replace(/\/$/, "");
  }
  return "";
}

/**
 * Top-of-page hero logo (banana / brand) — same as earlier login.
 */
export function getLoginHeroLogoUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_LOGIN_HERO_LOGO_URL?.trim();
  if (explicit) return explicit;
  const base = supabaseProjectOrigin();
  if (!base) return "";
  return `${base}/storage/v1/object/public/question-images/Banana%20images/GearUplogo.png`;
}

/**
 * Full-page background image behind login (`bk.png` in `question-images/Banana images/`).
 * Set `NEXT_PUBLIC_LOGIN_BG_IMAGE_URL` to override (e.g. full Supabase Storage URL).
 */
export function getLoginBackgroundImageUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_LOGIN_BG_IMAGE_URL?.trim();
  if (explicit) return explicit;
  const base = supabaseProjectOrigin();
  if (!base) return "";
  return `${base}/storage/v1/object/public/question-images/Banana%20images/bk.png`;
}

/**
 * Public marketing assets on Supabase Storage (login page).
 * Override with env vars if the bucket path or host changes.
 */
export function getLoginMarketingLogoUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_LOGIN_LOGO_URL?.trim();
  if (explicit) return explicit;
  const base = supabaseProjectOrigin();
  if (!base) return "";
  return `${base}/storage/v1/object/public/Webpage_images/logo/GearUp_Chi_Eng.png`;
}

export function getPlatformBriefTxtUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_PLATFORM_BRIEF_URL?.trim();
  if (explicit) return explicit;
  const base = supabaseProjectOrigin();
  if (!base) return "";
  return `${base}/storage/v1/object/public/Webpage_images/logo/platform_brief.txt`;
}
