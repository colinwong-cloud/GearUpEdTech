import type { GuoyuParentQuotaView } from "@/lib/guoyu/quota-copy";

export type ZhongwenXiezuoQuotaView = GuoyuParentQuotaView;

export function formatZhongwenXiezuoQuotaLine(view: ZhongwenXiezuoQuotaView): string {
  const { remaining, cap, isPaidMit } = view;
  const n = Math.max(0, Math.min(remaining, cap));

  if (isPaidMit && cap >= 10) {
    if (n > 0) {
      return `月費會員：中文寫作本月尚餘 ${n} 次（每月 10 次）。`;
    }
    return "本月中文寫作額度已用完（每月 10 次）。請下月再試。";
  }

  if (n > 0) {
    return `免費中文寫作：本月尚餘 ${n} 次（每月 1 次）。`;
  }
  return "免費中文寫作額度已用完（每月 1 次）。請升級月費以繼續產生。";
}

export const ZHONGWEN_XIEZUO_QUOTA_EXPLAINER =
  "綠勾勾＝已用額度；空心＝尚餘額度。月費用戶每月可享 10 次；免費用戶每月 1 次。中文寫作與拼音掃描、朗讀分開計。";
