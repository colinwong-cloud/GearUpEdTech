import { describe, expect, it } from "vitest";
import {
  ADMIN_ASSIGNED_USAGE_LIMIT,
  SELF_REGISTRATION_USAGE_LIMIT,
  buildOneTimeTutorPassword,
  buildTutorCode,
  formatTutorUsageCount,
  normalizeTutorContact,
  tutorPasswordError,
  tutorRegistrationSourceLabel,
} from "./tutor-registration";

describe("tutor self-registration rules", () => {
  it("accepts a name, 8-digit mobile, and email", () => {
    const result = normalizeTutorContact({
      tutorName: "  陳老師 ",
      tutorMobile: "9123-4567",
      tutorEmail: "Tutor@Example.com",
      emailRequired: true,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        tutorName: "陳老師",
        tutorMobile: "91234567",
        tutorEmail: "tutor@example.com",
      },
    });
  });

  it("rejects a short mobile and a missing email when email is required", () => {
    expect(
      normalizeTutorContact({
        tutorName: "陳老師",
        tutorMobile: "9123456",
        tutorEmail: "tutor@example.com",
        emailRequired: true,
      }).ok
    ).toBe(false);
    expect(
      normalizeTutorContact({
        tutorName: "陳老師",
        tutorMobile: "91234567",
        tutorEmail: "",
        emailRequired: true,
      }).ok
    ).toBe(false);
  });

  it("allows admin assignment to omit email", () => {
    const result = normalizeTutorContact({
      tutorName: "陳老師",
      tutorMobile: "91234567",
      tutorEmail: "",
      emailRequired: false,
    });
    expect(result.ok).toBe(true);
  });

  it("builds a 6-digit code and a 10-character password", () => {
    let cursor = 0;
    const nextInt = (max: number) => {
      cursor += 1;
      return cursor % max;
    };
    expect(buildTutorCode(nextInt)).toMatch(/^\d{6}$/);
    const password = buildOneTimeTutorPassword(() => 0);
    expect(password).toHaveLength(10);
    expect(password).toBe("AAAAAAAAAA");
    expect(tutorPasswordError(password)).toBeNull();
  });

  it("keeps admin codes at 50 and self-registered codes uncapped", () => {
    expect(ADMIN_ASSIGNED_USAGE_LIMIT).toBe(50);
    expect(formatTutorUsageCount(3, ADMIN_ASSIGNED_USAGE_LIMIT)).toBe("3 / 50");
    expect(formatTutorUsageCount(3, SELF_REGISTRATION_USAGE_LIMIT)).toBe("3（不設上限）");
    expect(tutorRegistrationSourceLabel("self")).toBe("自行登記");
    expect(tutorRegistrationSourceLabel("admin")).toBe("管理員指派");
  });

  it("rejects passwords outside 6 to 72 characters", () => {
    expect(tutorPasswordError("12345")).toBe("密碼最少 6 個字元。");
    expect(tutorPasswordError("a".repeat(73))).toBe("密碼過長，請控制在 72 個字元內。");
    expect(tutorPasswordError("123456")).toBeNull();
  });
});
