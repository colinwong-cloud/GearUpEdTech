import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRACTICE_STAMP_CARD_SIZE } from "./practice-stamp-card";
import {
  GROWTH_STAMP_COPY,
  STAMP_EARN_FEEDBACK,
  STAMP_FOOTER_COPY,
  buildStampGridSlotCount,
  parsePracticeStampAwardFromUpdateSession,
  practiceStampEarnFeedbackMessage,
  resolvePracticeStampFooterState,
  stampCardHeaderStreakLine,
  formatStampRedeemDateHkt,
  formatStampRedeemEmailStatus,
  formatStampRedeemFaceValue,
  parseStudentStampRedeemHistoryRows,
  STAMP_ACCOUNT_PROGRESS_SECTION_TITLE,
  STAMP_REDEEM_HISTORY_EMPTY,
  STAMP_REDEEM_HISTORY_HEADERS,
  STAMP_HOME_REOPEN_LABEL,
} from "./practice-stamp-card-ui";

describe("practice stamp card UI", () => {
  it("renders a 4×5 grid of 20 slots", () => {
    expect(buildStampGridSlotCount(PRACTICE_STAMP_CARD_SIZE)).toBe(20);
  });

  it("uses Growth TC v1 progress copy", () => {
    expect(GROWTH_STAMP_COPY.progress(3)).toBe("已連續練習 3 日／目標 20 日。繼續加油！");
    expect(GROWTH_STAMP_COPY.redeemSuccessAck).toContain("cs@gearupquiz.com");
    expect(GROWTH_STAMP_COPY.redeemableHint).toBe("按「立即換領」領取電子禮券。");
    expect(STAMP_FOOTER_COPY.redeemCta).toBe("立即換領");
    expect(GROWTH_STAMP_COPY.completedNotRedeemed).toBe("恭喜！已連續 20 日，可兌換禮品。");
  });

  it("maps earn feedback reasons to brief strings", () => {
    expect(practiceStampEarnFeedbackMessage({ awarded: true, streak: 5 })).toBe(
      STAMP_EARN_FEEDBACK.awarded(5)
    );
    expect(practiceStampEarnFeedbackMessage({ reason: "insufficient_answers" })).toBe(
      STAMP_EARN_FEEDBACK.insufficientAnswers
    );
  });

  it("resolves footer states exclusively", () => {
    const baseStatus = {
      has_active_card: true,
      stamps_program_open: true,
      stamps_per_card: 20,
      stamp_count: 20,
      streak: 20,
      stamped_today: true,
      last_stamp_hkt_date: "2026-10-28",
    };
    expect(
      resolvePracticeStampFooterState({
        status: baseStatus,
        redeemUiPhase: "idle",
        postRedeemMessage: false,
        giftWindowOpen: true,
        giftInStock: true,
      })
    ).toBe("redeemable");
    expect(
      resolvePracticeStampFooterState({
        status: baseStatus,
        redeemUiPhase: "idle",
        postRedeemMessage: false,
        giftWindowOpen: false,
        giftInStock: true,
      })
    ).toBe("window_closed");
  });

  it("parses practice_stamp from update_quiz_session payload", () => {
    const parsed = parsePracticeStampAwardFromUpdateSession({
      session_updated: true,
      practice_stamp: { awarded: true, streak: 4 },
    });
    expect(parsed?.awarded).toBe(true);
    expect(parsed?.streak).toBe(4);
  });

  it("formats header streak line", () => {
    expect(stampCardHeaderStreakLine(0)).toBe("已連續 0 日");
    expect(STAMP_FOOTER_COPY.enrolCta).toBe("開始收集印花");
  });

  it("exposes home reopen label matching the card title", () => {
    expect(STAMP_HOME_REOPEN_LABEL).toBe("練習印花卡");
  });

  it("locks Phase 3 account redeem history copy and headers", () => {
    expect(STAMP_ACCOUNT_PROGRESS_SECTION_TITLE).toBe("印花進度");
    expect(STAMP_REDEEM_HISTORY_EMPTY).toBe("尚未有兌換紀錄");
    expect(STAMP_REDEEM_HISTORY_HEADERS).toEqual([
      "兌換日期 (HKT)",
      "禮品名稱",
      "面值",
      "e-coupon 代碼",
      "電郵狀態",
    ]);
  });

  it("parses redeem history rows with immutable face value snapshot", () => {
    const rows = parseStudentStampRedeemHistoryRows([
      {
        id: "abc",
        redeemed_at_hkt: "2026-10-28 18:00:00",
        gift_name: "GearUp 練習獎賞禮券",
        face_value_hkd: 50,
        ecoupon_code: "GU-TEST-001",
        email_status: "sent",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.face_value_hkd).toBe(50);
    expect(formatStampRedeemFaceValue(50)).toBe("HK$50");
    expect(formatStampRedeemEmailStatus("sent").label).toBe("已發送");
    expect(formatStampRedeemEmailStatus("failed").retryHint).toContain("cs@gearupquiz.com");
    expect(formatStampRedeemDateHkt("2026-10-28")).toBe("2026/10/28");
  });

  it("uses a self-contained stamp seal SVG safe for img tags", () => {
    const seal = readFileSync(resolve(process.cwd(), "public/stamps/stamp-seal.svg"), "utf8");
    expect(seal).toContain("data:image/png;base64");
    expect(seal).not.toMatch(/href=["']\/icon\.png["']/);
  });
});
