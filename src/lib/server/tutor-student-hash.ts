import { createHmac } from "crypto";

const HASH_NAMESPACE = "tutor-student-v1";

/**
 * Deterministic, one-way token for a student's registered mobile, used only to
 * keep the raw mobile number out of the tutor student-summary URL. The value is
 * an HMAC-SHA256 hex digest keyed by the tutor session secret, so it cannot be
 * reversed client-side; the server resolves it back to a mobile by matching
 * against the tutor's own bound mobiles.
 */
export function computeTutorStudentHash(mobile: string, secret: string): string {
  const normalized = String(mobile ?? "").trim();
  return createHmac("sha256", secret)
    .update(`${HASH_NAMESPACE}:${normalized}`)
    .digest("hex");
}

export function getTutorHashSecret(): string {
  const value =
    process.env.TUTOR_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "";
  if (!value) {
    throw new Error("Missing TUTOR_SESSION_SECRET (or ADMIN_SESSION_SECRET fallback).");
  }
  return value;
}

export function tutorStudentHash(mobile: string): string {
  return computeTutorStudentHash(mobile, getTutorHashSecret());
}
