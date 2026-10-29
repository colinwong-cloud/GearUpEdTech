import { PRACTICE_STAMP_CARD_SIZE } from "./practice-stamp-card";
import { supabase } from "@/lib/supabase";

/** Growth TC v1 — locked strings (2026-10-28). */
export const GROWTH_STAMP_COPY = {
  blank: "開始每日練習，完成一次（至少 10 題）即可蓋印。",
  progress: (n: number) => `已連續練習 ${n} 日／目標 ${PRACTICE_STAMP_CARD_SIZE} 日。繼續加油！`,
  completedNotRedeemed: "恭喜！已連續 20 日，可兌換禮品。",
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

/** Account settings section title (Phase 3). */
export const STAMP_ACCOUNT_PROGRESS_SECTION_TITLE = "印花進度";

export const STAMP_REDEEM_HISTORY_EMPTY = "尚未有兌換紀錄";

/** Table headers — locked TC (Phase 3). */
export const STAMP_REDEEM_HISTORY_HEADERS = [
  "兌換日期 (HKT)",
  "禮品名稱",
  "面值",
  "e-coupon 代碼",
  "電郵狀態",
] as const;

export const STAMP_REDEEM_EMAIL_CS = "cs@gearupquiz.com";

export type StampRedeemEmailStatus = "sent" | "failed" | "pending" | null;

/** One row from get_student_stamp_redeem_history (Phase 3 / 5). */
export type StudentStampRedeemHistoryRow = {
  id: string;
  /** HKT calendar date or ISO timestamp from RPC. */
  redeemed_at_hkt: string | null;
  gift_name: string | null;
  /** Immutable face-value snapshot at redeem (Finance locked). */
  face_value_hkd: number | null;
  ecoupon_code: string | null;
  email_status: StampRedeemEmailStatus;
};

/** Session-scoped home dismiss flag (compact module on subject home). */
export const PRACTICE_STAMP_CARD_HOME_DISMISS_SESSION_KEY = "gearup_practice_stamp_card_dismissed";

/** On-screen reopen control on home after dismiss (matches card title). */
export const STAMP_HOME_REOPEN_LABEL = STAMP_CARD_HEADER_TITLE;

export function isPracticeStampCardHomeDismissedForSession(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(PRACTICE_STAMP_CARD_HOME_DISMISS_SESSION_KEY) === "1";
}

export function setPracticeStampCardHomeDismissedForSession(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(PRACTICE_STAMP_CARD_HOME_DISMISS_SESSION_KEY, "1");
}

export function clearPracticeStampCardHomeDismissForSession(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(PRACTICE_STAMP_CARD_HOME_DISMISS_SESSION_KEY);
}

/** Soft #2: hide subject-home chrome only when global 印花計劃開放 is confirmed off. */
export function shouldRenderPracticeStampHomeChrome(
  status: StudentStampCardStatus | null,
  loading: boolean
): boolean {
  if (loading) return true;
  if (!status) return true;
  return status.stamps_program_open;
}

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

export type StudentStampRedeemOffer = {
  gift_window_open: boolean;
  gift_in_stock: boolean;
  redeemable: boolean;
  gift_name: string | null;
  face_value_hkd: number | null;
  window_end_hkt: string | null;
};

export function formatStampGiftWindowEndLabel(windowEndHkt: string | null): string {
  if (!windowEndHkt || !/^\d{4}-\d{2}-\d{2}$/.test(windowEndHkt)) {
    return "—";
  }
  const [y, m, d] = windowEndHkt.split("-");
  return `${y}/${m}/${d}`;
}

function isMissingStampRedeemOfferRpc(errorMessage: string): boolean {
  return /get_student_stamp_redeem_offer|42883|PGRST202|does not exist|Could not find the function/i.test(
    errorMessage
  );
}

export function parseStudentStampRedeemOffer(data: unknown): StudentStampRedeemOffer | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.ok === false) return null;
  return {
    gift_window_open: row.gift_window_open === true,
    gift_in_stock: row.gift_in_stock === true,
    redeemable: row.redeemable === true,
    gift_name: typeof row.gift_name === "string" ? row.gift_name : null,
    face_value_hkd:
      typeof row.face_value_hkd === "number" && Number.isFinite(row.face_value_hkd)
        ? row.face_value_hkd
        : null,
    window_end_hkt: typeof row.window_end_hkt === "string" ? row.window_end_hkt : null,
  };
}

/** Loads redeem offer (gift preview + window/stock flags). Defaults open when RPC not deployed. */
export async function loadStudentStampRedeemOffer(studentId: string): Promise<StudentStampRedeemOffer> {
  const fallback: StudentStampRedeemOffer = {
    gift_window_open: true,
    gift_in_stock: true,
    redeemable: false,
    gift_name: null,
    face_value_hkd: null,
    window_end_hkt: null,
  };
  try {
    const { data, error } = await supabase.rpc("get_student_stamp_redeem_offer", {
      p_student_id: studentId,
    });
    if (error) {
      if (isMissingStampRedeemOfferRpc(error.message)) {
        return fallback;
      }
      return fallback;
    }
    return parseStudentStampRedeemOffer(data) ?? fallback;
  } catch {
    return fallback;
  }
}

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

export function parseStudentStampRedeemHistoryRows(data: unknown): StudentStampRedeemHistoryRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((item): StudentStampRedeemHistoryRow | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : null;
      if (!id) return null;
      const emailRaw = row.email_status;
      const email_status: StampRedeemEmailStatus =
        emailRaw === "sent" || emailRaw === "failed" || emailRaw === "pending"
          ? emailRaw
          : null;
      return {
        id,
        redeemed_at_hkt:
          typeof row.redeemed_at_hkt === "string"
            ? row.redeemed_at_hkt
            : typeof row.redeemed_hkt_date === "string"
              ? row.redeemed_hkt_date
              : null,
        gift_name: typeof row.gift_name === "string" ? row.gift_name : null,
        face_value_hkd:
          typeof row.face_value_hkd === "number" && Number.isFinite(row.face_value_hkd)
            ? row.face_value_hkd
            : null,
        ecoupon_code: typeof row.ecoupon_code === "string" ? row.ecoupon_code : null,
        email_status,
      };
    })
    .filter((row): row is StudentStampRedeemHistoryRow => row !== null);
}

export function formatStampRedeemDateHkt(value: string | null): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-");
    return `${y}/${m}/${d}`;
  }
  const wallClock = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (wallClock) {
    const [, y, m, d, hh, mm] = wallClock;
    return `${y}/${m}/${d} ${hh}:${mm}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return "—";
    const datePart = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsed);
    const timePart = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
    return `${datePart.replace(/-/g, "/")} ${timePart}`;
  }
  return trimmed.replace(/-/g, "/");
}

export function formatStampRedeemFaceValue(faceValueHkd: number | null): string {
  if (faceValueHkd === null || !Number.isFinite(faceValueHkd)) return "—";
  return `HK$${Math.round(faceValueHkd)}`;
}

export function formatStampRedeemEmailStatus(status: StampRedeemEmailStatus): {
  kind: "sent" | "failed" | "other";
  label: string;
  retryHint?: string;
} {
  if (status === "sent") {
    return { kind: "sent", label: "已發送" };
  }
  if (status === "failed") {
    return {
      kind: "failed",
      label: "失敗",
      retryHint: `如未收到電郵，請聯絡 ${STAMP_REDEEM_EMAIL_CS}`,
    };
  }
  if (status === "pending") {
    return { kind: "other", label: "處理中" };
  }
  return { kind: "other", label: "—" };
}

function isMissingStampRedeemHistoryRpc(errorMessage: string): boolean {
  return /get_student_stamp_redeem_history|42883|PGRST202|does not exist|Could not find the function/i.test(
    errorMessage
  );
}

/** Loads redeem history; returns empty rows when RPC is not deployed yet (Phase 5). */
export async function loadStudentStampRedeemHistory(studentId: string): Promise<{
  rows: StudentStampRedeemHistoryRow[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc("get_student_stamp_redeem_history", {
      p_student_id: studentId,
    });
    if (error) {
      if (isMissingStampRedeemHistoryRpc(error.message)) {
        return { rows: [], error: null };
      }
      return { rows: [], error: "未能載入兌換紀錄" };
    }
    const rows = parseStudentStampRedeemHistoryRows(data);
    return { rows, error: null };
  } catch {
    return { rows: [], error: null };
  }
}

export async function requestPracticeStampRedeem(studentId: string): Promise<{
  ok: boolean;
  couponCode?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/practice-stamp/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId }),
    });
    const payload = (await res.json()) as {
      ok?: boolean;
      couponCode?: string;
      error?: string;
    };
    if (!res.ok || !payload.ok || !payload.couponCode) {
      return { ok: false, error: payload.error ?? "redeem_failed" };
    }
    return { ok: true, couponCode: payload.couponCode };
  } catch {
    return { ok: false, error: "redeem_failed" };
  }
}
