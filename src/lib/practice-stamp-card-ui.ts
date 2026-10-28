import { PRACTICE_STAMP_CARD_SIZE } from "./practice-stamp-card";

/** Growth TC v1 — locked strings (2026-10-28). */
export const GROWTH_STAMP_COPY = {
  blank: "開始每日練習，完成一次（至少 10 題）即可蓋印。",
  progress: (n: number) => `已連續練習 ${n} 日／目標 ${PRACTICE_STAMP_CARD_SIZE} 日。繼續加油！`,
  completedNotRedeemed: "恭喜！已連續 20 日，可換領禮品。",
  redeemableHint: "按「立即換領」領取電子禮券。",
  afterRedeemNewCycle: "新一輪印花卡已開始，明日起可再蓋印。",
  redeemSuccessAck:
    "恭喜你完成連續 20 日練習！禮品兌換申請已收到。電子禮券將於本月底前電郵發送至你的帳戶電郵。如需查詢，請聯絡 cs@gearupquiz.com。",
  emailSubject: "GearUp Quiz｜你的練習獎賞電子禮券",
  emailBody: (giftName: string, faceValue: number, couponCode: string, redeemDateHkt: string) =>
    `親愛的家長／同學：感謝你堅持每日練習！以下是你兌換的電子禮券資料：禮品 ${giftName}｜面值 HK$${faceValue}｜兌換碼 ${couponCode}｜兌換日期 ${redeemDateHkt}。請妥善保存兌換碼。如有問題，請電郵 cs@gearupquiz.com。— GearUp Quiz 團隊`,
} as const;

/** Result-page earn feedback (Phase 2 brief). */
export const STAMP_EARN_FEEDBACK = {
  awarded: (n: number) => `今日印花已蓋上！連續 ${n}/${PRACTICE_STAMP_CARD_SIZE} 日`,
  insufficientAnswers: "完成至少 10 題才可蓋印",
  alreadyStampedToday: "今日已蓋印",
  enrolmentClosed: "活動暫停新報名",
} as const;

export const STAMP_CARD_HEADER_TITLE = "練習印花卡";

export function stampCardHeaderStreakLine(streak: number): string {
  return `已連續 ${streak} 日`;
}

export const STAMP_FOOTER_COPY = {
  progressDaysRemaining: (days: number) => `再練習 ${days} 日可換領禮品`,
  redeemCta: "立即換領",
  enrolCta: "開始收集印花",
  programClosedForNew: "活動暫停新報名",
  postRedeemTomorrow: "明日可開始新一輪印花卡",
  windowClosed: "換領期尚未開始或已結束，請稍後再試。",
  outOfStock: "禮品已換罄，如有疑問請聯絡 cs@gearupquiz.com。",
  redeemError: "兌換未能完成，請稍後再試或聯絡 cs@gearupquiz.com。",
  redeeming: "正在提交兌換…",
} as const;

export type PracticeStampFooterState =
  | "progress"
  | "redeemable"
  | "redeeming"
  | "success"
  | "error"
  | "window_closed"
  | "out_of_stock"
  | "program_closed_for_new"
  | "not_enrolled_open"
  | "not_enrolled_off"
  | "post_redeem";

export type StudentStampCardStatus = {
  has_active_card: boolean;
  stamps_program_open: boolean;
  stamps_per_card: number;
  stamp_count: number;
  streak: number;
  stamped_today: boolean;
  last_stamp_hkt_date: string | null;
  stamp_card_id?: string | null;
};

export type PracticeStampAwardPayload = {
  awarded?: boolean;
  reason?: string;
  streak?: number;
  stamp_count?: number;
  hkt_date?: string;
};

export type PracticeStampRedeemUiPhase = "idle" | "confirm" | "redeeming" | "success" | "error";

/** UI-only gift preview until Phase 4 admin inventory. */
export const STAMP_REDEEM_PLACEHOLDER_GIFT = {
  giftName: "GearUp 練習獎賞禮券",
  faceValueHkd: 50,
  windowEndLabel: "本月底",
} as const;

export function parseStudentStampCardStatus(data: unknown): StudentStampCardStatus | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    has_active_card: Boolean(row.has_active_card),
    stamps_program_open: row.stamps_program_open !== false,
    stamps_per_card:
      typeof row.stamps_per_card === "number" ? row.stamps_per_card : PRACTICE_STAMP_CARD_SIZE,
    stamp_count: typeof row.stamp_count === "number" ? row.stamp_count : 0,
    streak: typeof row.streak === "number" ? row.streak : 0,
    stamped_today: Boolean(row.stamped_today),
    last_stamp_hkt_date:
      typeof row.last_stamp_hkt_date === "string" ? row.last_stamp_hkt_date : null,
    stamp_card_id: typeof row.stamp_card_id === "string" ? row.stamp_card_id : null,
  };
}

export function parsePracticeStampAwardFromUpdateSession(data: unknown): PracticeStampAwardPayload | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const nested = root.practice_stamp;
  const stamp = (nested && typeof nested === "object" ? nested : root) as Record<string, unknown>;
  return {
    awarded: stamp.awarded === true,
    reason: typeof stamp.reason === "string" ? stamp.reason : undefined,
    streak: typeof stamp.streak === "number" ? stamp.streak : undefined,
    stamp_count: typeof stamp.stamp_count === "number" ? stamp.stamp_count : undefined,
  };
}

export function stampSlotRotationDeg(index: number): number {
  const spread = ((index * 7) % 13) - 6;
  return spread;
}

export function buildStampGridSlotCount(stampsPerCard: number): number {
  return stampsPerCard;
}

export function resolvePracticeStampFooterState(input: {
  status: StudentStampCardStatus | null;
  redeemUiPhase: PracticeStampRedeemUiPhase;
  postRedeemMessage: boolean;
  giftWindowOpen: boolean;
  giftInStock: boolean;
}): PracticeStampFooterState {
  if (input.redeemUiPhase === "redeeming") return "redeeming";
  if (input.redeemUiPhase === "success") return "success";
  if (input.redeemUiPhase === "error") return "error";
  if (input.postRedeemMessage) return "post_redeem";

  const status = input.status;
  if (!status) return "not_enrolled_open";

  if (!status.has_active_card) {
    return status.stamps_program_open ? "not_enrolled_open" : "not_enrolled_off";
  }

  const goal = status.stamps_per_card || PRACTICE_STAMP_CARD_SIZE;
  const redeemEligible = status.streak >= goal;

  if (redeemEligible) {
    if (!input.giftWindowOpen) return "window_closed";
    if (!input.giftInStock) return "out_of_stock";
    return "redeemable";
  }

  if (!status.stamps_program_open && !status.has_active_card) {
    return "program_closed_for_new";
  }

  return "progress";
}

export function practiceStampEarnFeedbackMessage(
  award: PracticeStampAwardPayload | null | undefined
): string | null {
  if (!award) return null;
  if (award.awarded) {
    const n = award.streak ?? award.stamp_count ?? 0;
    return STAMP_EARN_FEEDBACK.awarded(n);
  }
  if (award.reason === "insufficient_answers") return STAMP_EARN_FEEDBACK.insufficientAnswers;
  if (award.reason === "already_stamped_today") return STAMP_EARN_FEEDBACK.alreadyStampedToday;
  if (award.reason === "enrolment_closed") return STAMP_EARN_FEEDBACK.enrolmentClosed;
  return null;
}

export function progressFooterLine(status: StudentStampCardStatus): string {
  const goal = status.stamps_per_card || PRACTICE_STAMP_CARD_SIZE;
  const remaining = Math.max(0, goal - status.streak);
  if (remaining > 0 && status.streak > 0) {
    return STAMP_FOOTER_COPY.progressDaysRemaining(remaining);
  }
  if (status.stamp_count === 0 && status.streak === 0) {
    return GROWTH_STAMP_COPY.blank;
  }
  return GROWTH_STAMP_COPY.progress(status.streak);
}

/**
 * TODO Phase 5: replace with redeem RPC + Resend email send.
 */
export async function requestPracticeStampRedeem(studentId: string): Promise<{
  ok: boolean;
  couponCode?: string;
  error?: string;
}> {
  void studentId;
  return { ok: false, error: "redeem_api_not_wired" };
}
