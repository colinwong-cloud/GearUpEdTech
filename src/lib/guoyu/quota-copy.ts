/** Owner-locked OCR/TTS quota copy (BRIEF §2.3) — caps mirror Finance lock (paid_until + tutor). */

export type GuoyuParentQuotaView = {
  remaining: number;
  cap: number;
  /** Live parent HK$99 tier (cap 10), not tutor MIT */
  isPaidMit: boolean;
};

export type GuoyuOcrQuotaView = GuoyuParentQuotaView;
export type GuoyuTtsQuotaView = GuoyuParentQuotaView;

export const GUOYU_FREE_OCR_CAP = 1;
export const GUOYU_PAID_OCR_CAP = 10;

export function guoyuQuotaCircleTotal(view: GuoyuParentQuotaView): number {
  if (view.isPaidMit && view.cap >= 10) return 10;
  return 1;
}

export function guoyuQuotaCirclesUsed(view: GuoyuParentQuotaView): number {
  const total = guoyuQuotaCircleTotal(view);
  const remaining = Math.max(0, Math.min(view.remaining, view.cap));
  const used = total - Math.min(remaining, total);
  return Math.max(0, Math.min(total, used));
}

/** @deprecated use guoyuQuotaCircleTotal */
export const guoyuOcrQuotaCircleTotal = guoyuQuotaCircleTotal;
/** @deprecated use guoyuQuotaCirclesUsed */
export const guoyuOcrQuotaCirclesUsed = guoyuQuotaCirclesUsed;

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

export function formatGuoyuTtsQuotaLine(view: GuoyuTtsQuotaView): string {
  const { remaining, cap, isPaidMit } = view;
  const n = Math.max(0, Math.min(remaining, cap));

  if (isPaidMit && cap >= 10) {
    if (n > 0) {
      return `月費會員：朗讀本月尚餘 ${n} 次（每月 10 次）。`;
    }
    return "本月朗讀額度已用完（每月 10 次）。請下月再試，或稍後再聽。";
  }

  if (n > 0) {
    return `免費朗讀：本月尚餘 ${n} 次（每月 1 次）。`;
  }
  return "免費朗讀額度已用完（每月 1 次）。請升級月費以繼續朗讀。";
}

export function guoyuOcrUpsellVisible(view: GuoyuOcrQuotaView): boolean {
  return !view.isPaidMit && view.remaining <= 0;
}

export function guoyuTtsQuotaExhausted(
  remaining: number,
  rpcReady: boolean
): boolean {
  return rpcReady && remaining <= 0;
}
