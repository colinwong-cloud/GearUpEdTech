/**
 * Full URL to the platform payment terms (.txt, Traditional Chinese).
 * Set NEXT_PUBLIC_PAYMENT_TERMS_URL to override.
 * Otherwise uses the public Storage file already shown to parents.
 */
export function getPaymentTermsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_PAYMENT_TERMS_URL?.trim();
  if (explicit) return explicit;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return base
    ? `${base}/storage/v1/object/public/Webpage_statements/payment_terms_condition_0930.txt`
    : "/payment_terms_condition_0930.txt";
}
