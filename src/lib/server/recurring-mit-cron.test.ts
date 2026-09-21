import { describe, expect, it } from "vitest";
import {
  alreadyChargedThisCycle,
  filterEligibleMitCronProfiles,
  isEligibleForMitCronAttempt,
  isMitCronRunOverdue,
} from "./recurring-mit-cron";

const NOW = new Date("2026-09-20T00:25:00.000Z");

describe("isEligibleForMitCronAttempt", () => {
  it("selects due active profiles", () => {
    expect(
      isEligibleForMitCronAttempt(
        {
          status: "active",
          next_charge_at: "2026-09-10T00:43:00.000Z",
          last_error: null,
        },
        NOW
      )
    ).toBe(true);
  });

  it("retries due failed profiles whose last_error is a confirm validation miss", () => {
    expect(
      isEligibleForMitCronAttempt(
        {
          status: "failed",
          next_charge_at: "2026-09-10T00:43:00.000Z",
          last_error:
            "Airwallex payment_intents/confirm failed (400) [validation_error]: triggered_by is required",
        },
        NOW
      )
    ).toBe(true);
  });

  it("does not retry issuer declines, disabled consents, or paused rows", () => {
    expect(
      isEligibleForMitCronAttempt(
        {
          status: "failed",
          next_charge_at: "2026-09-10T00:43:00.000Z",
          last_error:
            "Airwallex payment_intents/confirm failed (400) [issuer_declined]: Insufficient funds",
        },
        NOW
      )
    ).toBe(false);
    expect(
      isEligibleForMitCronAttempt(
        {
          status: "failed",
          next_charge_at: "2026-09-10T00:43:00.000Z",
          last_error: "Payment consent is not usable for MIT (status=DISABLED)",
        },
        NOW
      )
    ).toBe(false);
    expect(
      isEligibleForMitCronAttempt(
        {
          status: "paused",
          next_charge_at: "2026-09-10T00:43:00.000Z",
          last_error: null,
        },
        NOW
      )
    ).toBe(false);
  });

  it("skips rows whose next_charge_at is still in the future", () => {
    expect(
      isEligibleForMitCronAttempt(
        {
          status: "active",
          next_charge_at: "2026-10-10T00:43:00.000Z",
        },
        NOW
      )
    ).toBe(false);
  });

  it("skips a due row that already has last_charged_at on or after next_charge_at", () => {
    expect(
      alreadyChargedThisCycle(
        {
          next_charge_at: "2026-09-10T00:43:00.000Z",
          last_charged_at: "2026-09-20T00:20:00.000Z",
        },
        NOW
      )
    ).toBe(true);
    expect(
      isEligibleForMitCronAttempt(
        {
          status: "active",
          next_charge_at: "2026-09-10T00:43:00.000Z",
          last_charged_at: "2026-09-20T00:20:00.000Z",
        },
        NOW
      )
    ).toBe(false);
  });
});

describe("filterEligibleMitCronProfiles", () => {
  it("keeps 91917838-style failed validation rows in the due set", () => {
    const eligible = filterEligibleMitCronProfiles(
      [
        {
          status: "failed",
          next_charge_at: "2026-09-10T00:43:00.000Z",
          last_error:
            "Airwallex payment_intents/confirm failed (400) [validation_error]: triggered_by is required",
          mobile_number: "91917838",
        },
        {
          status: "failed",
          next_charge_at: "2026-09-10T00:43:00.000Z",
          last_error: "Missing recurring payment credentials (customer/payment_method/payment_consent)",
          mobile_number: "11111111",
        },
      ],
      NOW
    );
    expect(eligible.map((row) => row.mobile_number)).toEqual(["91917838"]);
  });
});

describe("isMitCronRunOverdue", () => {
  it("treats a missing or 26h+ stale heartbeat as overdue", () => {
    expect(isMitCronRunOverdue(null, NOW)).toBe(true);
    expect(isMitCronRunOverdue("2026-09-18T00:25:00.000Z", NOW)).toBe(true);
    expect(isMitCronRunOverdue("2026-09-20T00:10:00.000Z", NOW)).toBe(false);
  });
});
