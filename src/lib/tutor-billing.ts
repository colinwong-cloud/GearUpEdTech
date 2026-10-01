export const TUTOR_PLAN_PRICE_HKD = 199;
const TUTOR_GRANT_MS = 30 * 24 * 60 * 60 * 1000;

/** Complimentary access lasts 30 days from the moment an admin grants it. */
export function tutorGrantPaidUntil(now = new Date()): string {
  return new Date(now.getTime() + TUTOR_GRANT_MS).toISOString();
}

export function tutorMerchantOrderId(code: string, now = new Date()): string {
  const digits = String(code ?? "").replace(/\D/g, "").slice(0, 6) || "tutor";
  return `tutor-${digits}-${now.getTime()}`;
}

export function isTutorMerchantOrderId(value: string | null | undefined): boolean {
  return String(value ?? "").startsWith("tutor-");
}

/** Extend from the later of now and the current paid_until, by one calendar month. */
export function extendTutorPaidUntil(current: string | null | undefined, now = new Date()): string {
  const currentTime = current ? Date.parse(current) : Number.NaN;
  const start = Number.isFinite(currentTime) && currentTime > now.getTime() ? new Date(currentTime) : now;
  const next = new Date(start.getTime());
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}
