import { describe, expect, it } from "vitest";
import {
  buildStampProgramSettingsPayload,
  classifyGiftCodeImport,
  formatStampGiftCodeCountsLine,
  formatStampProgramAuditLine,
  parseGiftCodeCsv,
  shouldShowStampProgramAuditEmpty,
  STAMP_GIFT_BTN_EXPORT_ALL,
  STAMP_GIFT_BTN_EXPORT_UNUSED,
  STAMP_GIFT_BTN_IMPORT_CSV,
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

  it("shows empty audit placeholder only when no audit row yet", () => {
    expect(
      shouldShowStampProgramAuditEmpty({
        loading: false,
        errorMessage: "",
        program: { stamps_program_open: true, audit: null },
      })
    ).toBe(true);
    expect(
      shouldShowStampProgramAuditEmpty({
        loading: false,
        errorMessage: "",
        program: buildStampProgramSettingsPayload({
          open: true,
          auditRow: {
            toggled_at: "2026-10-28T02:30:00.000Z",
            admin_identifier: "colin",
          },
        }),
      })
    ).toBe(false);
    expect(formatStampProgramAuditLine(null)).toBeNull();
  });
});

describe("Growth-locked gift inventory copy", () => {
  it("formats code counts and button labels", () => {
    expect(formatStampGiftCodeCountsLine(10, 7, 3)).toBe("總碼 10 / 未用 7 / 已用 3");
    expect(STAMP_GIFT_BTN_IMPORT_CSV).toBe("匯入兌換碼 CSV");
    expect(STAMP_GIFT_BTN_EXPORT_UNUSED).toBe("匯出未用碼");
    expect(STAMP_GIFT_BTN_EXPORT_ALL).toBe("匯出全部碼");
  });
});
