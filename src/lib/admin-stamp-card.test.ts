import { describe, expect, it } from "vitest";
import {
  buildStampProgramSettingsPayload,
  classifyGiftCodeImport,
  formatStampProgramAuditLine,
  parseGiftCodeCsv,
  STAMP_GIFT_CODE_IMPORT_SUMMARY_LABEL,
} from "@/lib/admin-stamp-card";

describe("parseGiftCodeCsv", () => {
  it("accepts codes from a headered CSV", () => {
    const { codes, failed } = parseGiftCodeCsv("code\nABC123\nDEF456\n");
    expect(codes).toEqual(["ABC123", "DEF456"]);
    expect(failed).toBe(0);
  });

  it("counts invalid code cells as failed when header present", () => {
    const { codes, failed } = parseGiftCodeCsv("code\nGOOD\n,\n");
    expect(codes).toEqual(["GOOD"]);
    expect(failed).toBe(1);
  });

  it("classifies duplicate and failed import summary TC", () => {
    const parsed = parseGiftCodeCsv("code\nA1\nA1\n,\n");
    const result = classifyGiftCodeImport(parsed.codes, parsed.failed, new Set(["EXISTING"]));
    expect(result.accepted).toBe(1);
    expect(result.duplicate).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.summary_tc).toBe(
      `${STAMP_GIFT_CODE_IMPORT_SUMMARY_LABEL} 1 · 重複 1 · 失敗 1`
    );
  });
});

describe("program toggle audit shape", () => {
  it("formats audit line for admin panel", () => {
    const payload = buildStampProgramSettingsPayload({
      open: false,
      auditRow: {
        toggled_at: "2026-10-28T02:30:00.000Z",
        admin_identifier: "colin",
      },
    });
    expect(payload.stamps_program_open).toBe(false);
    expect(payload.audit?.admin_identifier).toBe("colin");
    const line = formatStampProgramAuditLine(payload.audit);
    expect(line).toMatch(/^上次更新：/);
    expect(line).toContain("(HKT)");
    expect(line).toContain("colin");
  });
});
