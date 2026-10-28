import { describe, it, expect } from "vitest";
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
} from "./practice-stamp-card-ui";

describe("practice stamp card UI", () => {
  it("renders a 4×5 grid of 20 slots", () => {
    expect(buildStampGridSlotCount(PRACTICE_STAMP_CARD_SIZE)).toBe(20);
  });

  it("uses Growth TC v1 progress copy", () => {
    expect(GROWTH_STAMP_COPY.progress(3)).toBe("已連續練習 3 日／目標 20 日。繼續加油！");
    expect(GROWTH_STAMP_COPY.redeemSuccessAck).toContain("cs@gearupquiz.com");
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
});
