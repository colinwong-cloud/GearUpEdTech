import { classifyRecurringChargeFailure } from "@/lib/server/recurring-mit-confirm";

export type MitCronCandidate = {
  status: string | null;
  next_charge_at: string | null;
  last_error?: string | null;
  last_charged_at?: string | null;
};

export const MIT_CRON_SELECT_STATUSES = ["active", "failed"] as const;
export const MIT_CRON_OVERDUE_MS = 26 * 60 * 60 * 1000;

export function isDueForMitCharge(
  nextChargeAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  const due = new Date(String(nextChargeAt || ""));
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() <= now.getTime();
}

export function alreadyChargedThisCycle(
  profile: Pick<MitCronCandidate, "next_charge_at" | "last_charged_at">,
  now: Date = new Date()
): boolean {
  const due = new Date(String(profile.next_charge_at || ""));
  const charged = new Date(String(profile.last_charged_at || ""));
  if (Number.isNaN(due.getTime()) || Number.isNaN(charged.getTime())) return false;
  if (due.getTime() > now.getTime()) return false;
  return charged.getTime() >= due.getTime();
}

export function isEligibleForMitCronAttempt(
  profile: MitCronCandidate,
  now: Date = new Date()
): boolean {
  const status = String(profile.status || "").trim().toLowerCase();
  if (status === "paused" || status === "cancelled") return false;
  if (!isDueForMitCharge(profile.next_charge_at, now)) return false;
  if (alreadyChargedThisCycle(profile, now)) return false;
  if (status === "active") return true;
  if (status === "failed") {
    return (
      classifyRecurringChargeFailure({
        reason: profile.last_error || "",
      }) === "retryable"
    );
  }
  return false;
}

export function filterEligibleMitCronProfiles<T extends MitCronCandidate>(
  profiles: T[],
  now: Date = new Date()
): T[] {
  return profiles.filter((profile) => isEligibleForMitCronAttempt(profile, now));
}

export function isMitCronRunOverdue(
  lastStartedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastStartedAt) return true;
  const started = new Date(lastStartedAt);
  if (Number.isNaN(started.getTime())) return true;
  return now.getTime() - started.getTime() > MIT_CRON_OVERDUE_MS;
}

export function isMissingCronRunTableError(message: string): boolean {
  return /recurring_cron_runs|42P01|does not exist/i.test(message);
}
