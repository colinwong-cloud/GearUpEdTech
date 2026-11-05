import {
  GUOYU_FREE_OCR_CAP,
  GUOYU_PAID_OCR_CAP,
} from "@/lib/guoyu/quota-copy";

/** Finance lock: tutor parent always cap 1; else cap 10 when paid_until >= now(). */
export function computeGuoyuOcrCap(params: {
  paidUntil: string | null;
  isTutorParent: boolean;
  now?: Date;
}): number {
  if (params.isTutorParent) return GUOYU_FREE_OCR_CAP;
  const now = params.now ?? new Date();
  if (params.paidUntil) {
    const until = new Date(params.paidUntil);
    if (!Number.isNaN(until.getTime()) && until >= now) {
      return GUOYU_PAID_OCR_CAP;
    }
  }
  return GUOYU_FREE_OCR_CAP;
}

export function computeGuoyuOcrRemaining(cap: number, usageCount: number): number {
  return Math.max(0, cap - Math.max(0, usageCount));
}
