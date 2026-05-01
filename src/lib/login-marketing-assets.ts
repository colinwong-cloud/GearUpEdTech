/**
 * Public marketing assets on Supabase Storage (login page).
 * Override with env vars if the bucket path or host changes.
 */
export function getLoginMarketingLogoUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_LOGIN_LOGO_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/Webpage_images/logo/GearUp_Chi_Eng.png`;
}

export function getPlatformBriefTxtUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_PLATFORM_BRIEF_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/Webpage_images/logo/platform_brief.txt`;
}
