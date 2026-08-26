import { createHmac, timingSafeEqual } from "crypto";

const HASH_NAMESPACE = "tutor-student-v1";
const HASH_NAMESPACE_V2 = "tutor-student-v2";

/**
 * Deterministic, one-way token for a student's registered mobile, used only to
 * keep the raw mobile number out of the tutor student-summary URL. The value is
 * an HMAC-SHA256 hex digest keyed by the tutor session secret, so it cannot be
 * reversed client-side; the server resolves it back to a mobile by matching
 * against the tutor's own bound mobiles.
 *
 * v1 hashes are mobile-only and no longer used for View links. Kept so old
 * bookmarked URLs fail closed instead of being reinterpreted as a family dump.
 */
export function computeTutorStudentHash(mobile: string, secret: string): string {
  const normalized = String(mobile ?? "").trim();
  return createHmac("sha256", secret)
    .update(`${HASH_NAMESPACE}:${normalized}`)
    .digest("hex");
}

/**
 * Student-scoped View token: HMAC of mobile + student id. Two siblings under
 * the same registered mobile get different hashes, so the details page can
 * load one student only.
 */
export function computeTutorStudentScopeHash(
  mobile: string,
  studentId: string,
  secret: string
): string {
  const normalizedMobile = String(mobile ?? "").trim();
  const normalizedStudentId = String(studentId ?? "").trim();
  return createHmac("sha256", secret)
    .update(`${HASH_NAMESPACE_V2}:${normalizedMobile}:${normalizedStudentId}`)
    .digest("hex");
}

export function tutorHashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(String(left ?? ""), "utf8");
  const b = Buffer.from(String(right ?? ""), "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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

export function tutorStudentScopeHash(mobile: string, studentId: string): string {
  return computeTutorStudentScopeHash(mobile, studentId, getTutorHashSecret());
}
