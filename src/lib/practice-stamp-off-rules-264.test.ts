import { describe, it, expect } from "vitest";
import {
  effectivePracticeStampStreak,
  evaluatePracticeStampAward,
  previousHktCalendarDate,
  resolvePracticeStampShowCard,
  stampProgramAllowsNewEnrol,
} from "./practice-stamp-card";
import { shouldShowPracticeStampCard } from "./practice-stamp-card-ui";

const CLOSE = "2026-11-30";

describe("Soft #264 stamp off-period rules", () => {
  describe("stampProgramAllowsNewEnrol", () => {
    it("allows new starts all day on switch-off HKT date", () => {
      expect(stampProgramAllowsNewEnrol(false, CLOSE, CLOSE)).toBe(true);
      expect(stampProgramAllowsNewEnrol(false, CLOSE, "2026-11-29")).toBe(false);
      expect(stampProgramAllowsNewEnrol(false, CLOSE, "2026-12-01")).toBe(false);
    });

    it("allows when campaign is on", () => {
      expect(stampProgramAllowsNewEnrol(true, CLOSE, "2026-12-05")).toBe(true);
    });
  });

  describe("resolvePracticeStampShowCard", () => {
    it("shows everyone when campaign is on including broken streak", () => {
      expect(
        resolvePracticeStampShowCard({
          programOpen: true,
          programClosedOnHktDate: CLOSE,
          todayHkt: "2026-12-04",
          hasActiveCard: true,
          stampCount: 5,
          effectiveStreak: 0,
          lastStampHktDate: "2026-12-01",
        })
      ).toBe(true);
    });

    it("shows 0-stamp students on switch-off day only", () => {
      expect(
        resolvePracticeStampShowCard({
          programOpen: false,
          programClosedOnHktDate: CLOSE,
          todayHkt: CLOSE,
          hasActiveCard: false,
          stampCount: 0,
          effectiveStreak: 0,
          lastStampHktDate: null,
        })
      ).toBe(true);
      expect(
        resolvePracticeStampShowCard({
          programOpen: false,
          programClosedOnHktDate: CLOSE,
          todayHkt: "2026-12-01",
          hasActiveCard: false,
          stampCount: 0,
          effectiveStreak: 0,
          lastStampHktDate: null,
        })
      ).toBe(false);
    });

    it("keeps mid-card visible while off with live streak", () => {
      expect(
        resolvePracticeStampShowCard({
          programOpen: false,
          programClosedOnHktDate: CLOSE,
          todayHkt: "2026-12-02",
          hasActiveCard: true,
          stampCount: 5,
          effectiveStreak: 2,
          lastStampHktDate: "2026-12-02",
        })
      ).toBe(true);
    });

    it("hides after miss post switch-off (28 Nov–4 Dec example)", () => {
      expect(
        resolvePracticeStampShowCard({
          programOpen: false,
          programClosedOnHktDate: CLOSE,
          todayHkt: "2026-12-04",
          hasActiveCard: true,
          stampCount: 5,
          effectiveStreak: 0,
          lastStampHktDate: "2026-12-02",
        })
      ).toBe(false);
    });

    it("hides 0-stamp non-starters after switch-off day", () => {
      expect(
        resolvePracticeStampShowCard({
          programOpen: false,
          programClosedOnHktDate: CLOSE,
          todayHkt: "2026-12-01",
          hasActiveCard: true,
          stampCount: 0,
          effectiveStreak: 0,
          lastStampHktDate: null,
        })
      ).toBe(false);
    });
  });

  describe("evaluatePracticeStampAward", () => {
    it("blocks new enrol after switch-off HKT day", () => {
      const afterClose = evaluatePracticeStampAward({
        answeredCount: 10,
        programOpen: false,
        programClosedOnHktDate: CLOSE,
        hasActiveCard: false,
        alreadyStampedToday: false,
        lastStampHktDate: null,
        storedStreak: 0,
        awardHktDate: "2026-12-01",
      });
      expect(afterClose.reason).toBe("enrolment_closed");
    });

    it("allows same-day starter at 18:00 on switch-off day", () => {
      const sameDay = evaluatePracticeStampAward({
        answeredCount: 10,
        programOpen: false,
        programClosedOnHktDate: CLOSE,
        hasActiveCard: false,
        alreadyStampedToday: false,
        lastStampHktDate: null,
        storedStreak: 0,
        awardHktDate: CLOSE,
      });
      expect(sameDay).toMatchObject({ awarded: true, newStreak: 1, enrolsNewCard: true });
    });

    it("does not restart after gap while campaign is off", () => {
      const dec2 = "2026-12-02";
      const dec4 = "2026-12-04";
      const restartBlocked = evaluatePracticeStampAward({
        answeredCount: 10,
        programOpen: false,
        programClosedOnHktDate: CLOSE,
        hasActiveCard: true,
        alreadyStampedToday: false,
        lastStampHktDate: dec2,
        storedStreak: 2,
        awardHktDate: dec4,
      });
      expect(restartBlocked.reason).toBe("enrolment_closed");
    });

    it("continues consecutive awards while off", () => {
      const dec1 = "2026-12-01";
      const dec2 = "2026-12-02";
      const mid = evaluatePracticeStampAward({
        answeredCount: 10,
        programOpen: false,
        programClosedOnHktDate: CLOSE,
        hasActiveCard: true,
        alreadyStampedToday: false,
        lastStampHktDate: dec1,
        storedStreak: 3,
        awardHktDate: dec2,
      });
      expect(mid).toMatchObject({ awarded: true, newStreak: 4 });
    });
  });

  describe("campaign on streak break visibility", () => {
    it("shows zero effective streak immediately when program is on", () => {
      const today = "2026-10-28";
      const twoDaysAgo = previousHktCalendarDate(previousHktCalendarDate(today));
      expect(effectivePracticeStampStreak(twoDaysAgo, today, 4)).toBe(0);
      expect(
        shouldShowPracticeStampCard({
          has_active_card: true,
          show_stamp_card: true,
          stamps_program_open: true,
          stamps_per_card: 20,
          stamp_count: 4,
          streak: 0,
          stamped_today: false,
          last_stamp_hkt_date: twoDaysAgo,
        })
      ).toBe(true);
    });
  });
});