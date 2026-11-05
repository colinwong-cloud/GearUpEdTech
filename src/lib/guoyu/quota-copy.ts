/** Owner-locked OCR quota copy (BRIEF §2.3) */

export type GuoyuOcrQuotaView = {
  remaining: number;
  cap: number;
  /** Live parent HK$99 tier (cap 10), not tutor MIT */
  isPaidMit: boolean;
};

export function formatGuoyuOcrQuotaLine(view: GuoyuOcrQuotaView): string {
  const { remaining, cap, isPaidMit } = view;
  const n = Math.max(0, Math.min(remaining, cap));

  if (isPaidMit && cap >= 10) {
    if (n > 0) {
      return `月費會員：OCR 本月尚餘 ${n} 次（每月 10 次）。`;
    }
    return "本月 OCR 額度已用完（每月 10 次）。請下月再試掃描，或直接在下方輸入文字練習。";
  }

  if (n > 0) {
    return `免費 OCR：本月尚餘 ${n} 次（每月 1 次）。用完後仍可手動輸入文字練習。`;
  }
  return "免費 OCR 額度已用完（每月 1 次）。請升級月費以繼續掃描，或直接在下方輸入文字練習。";
}

/** Visual quota row: 10 circles for paid MIT; 1 for free/tutor. */
export function guoyuOcrQuotaCircleTotal(view: GuoyuOcrQuotaView): number {
  if (view.isPaidMit && view.cap >= 10) return 10;
  return 1;
}

/** Lit circles = OCR uses consumed this month (within displayed total). */
export function guoyuOcrQuotaCirclesUsed(view: GuoyuOcrQuotaView): number {
  const total = guoyuOcrQuotaCircleTotal(view);
  const remaining = Math.max(0, Math.min(view.remaining, view.cap));
  const used = total - Math.min(remaining, total);
  return Math.max(0, Math.min(total, used));
}

export function guoyuOcrUpsellVisible(view: GuoyuOcrQuotaView): boolean {
  return !view.isPaidMit && view.remaining <= 0;
}

export const GUOYU_FREE_OCR_CAP = 1;
export const GUOYU_PAID_OCR_CAP = 10;
