export const TUTOR_PLAN_PRICE_HKD = 199;

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
