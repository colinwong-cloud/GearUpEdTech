/**
 * Full URL to the platform privacy statement (.txt, Traditional Chinese).
 * Set NEXT_PUBLIC_PRIVACY_STATEMENT_URL to override (e.g. if the file is on another host).
 * Otherwise uses NEXT_PUBLIC_SUPABASE_URL + public Storage path (same pattern as other public assets).
 */
export function getPrivacyStatementTxtUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_PRIVACY_STATEMENT_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/Webpage_statements/privacy_statment.txt`;
}
