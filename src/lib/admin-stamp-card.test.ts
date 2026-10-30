import { describe, expect, it } from "vitest";
import {
  buildStampProgramSettingsPayload,
  classifyGiftCodeImport,
  computeStampStudentProgressTotals,
  formatStampGiftCodeCountsLine,
  formatStampProgramAuditLine,
  getAdminStampProgressDefaultDateRange,
  isStampProgressResumeEligible,
  mapStampStudentProgressRow,
  nextStampStudentProgressSortState,
  parseGiftCodeCsv,
  resolveStampProgressStartDateHkt,
  shouldShowStampProgramAuditEmpty,
  sortStampStudentProgressRows,
  stampProgressRowInHktRange,
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

describe("admin student stamp progress", () => {
  it("defaults date range to month-to-date in HKT", () => {
    const range = getAdminStampProgressDefaultDateRange(new Date("2026-10-29T02:00:00.000Z"));
    expect(range.endHkt).toBe("2026-10-29");
    expect(range.startHkt).toBe("2026-10-01");
  });

  it("uses first award as start date when present", () => {
    expect(
      resolveStampProgressStartDateHkt("2026-10-01T00:00:00.000Z", "2026-10-05")
    ).toBe("2026-10-05");
    expect(resolveStampProgressStartDateHkt("2026-10-01T00:00:00.000Z", null)).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
  });

  it("marks resume eligible only when effective streak is broken", () => {
    expect(
      isStampProgressResumeEligible({
        todayHkt: "2026-10-29",
        status: "active",
        stampCount: 5,
        storedStreak: 5,
        lastStampHktDate: "2026-10-26",
      })
    ).toBe(true);
    expect(
      isStampProgressResumeEligible({
        todayHkt: "2026-10-29",
        status: "active",
        stampCount: 5,
        storedStreak: 5,
        lastStampHktDate: "2026-10-28",
      })
    ).toBe(false);
  });

  it("maps progress row with full mobile for admin and KPI exclusion", () => {
    const row = mapStampStudentProgressRow({
      stamp_card_id: "card-1",
      student_id: "stu-1",
      student_name: "小明",
      mobile_number: "65671234",
      enrolled_at: "2026-10-01T00:00:00.000Z",
      first_award_hkt_date: "2026-10-02",
      status: "active",
      stamp_count: 3,
      current_streak: 3,
      last_stamp_hkt_date: "2026-10-26",
      todayHkt: "2026-10-29",
    });
    expect(row.user_display).toBe("65671234");
    expect(row.effective_streak).toBe(0);
    expect(row.resume_eligible).toBe(true);
    expect(row.excluded_from_kpi).toBe(false);

    const testRow = mapStampStudentProgressRow({
      stamp_card_id: "card-2",
      student_id: "stu-2",
      student_name: "測試",
      mobile_number: "99991234",
      enrolled_at: "2026-10-01T00:00:00.000Z",
      first_award_hkt_date: "2026-10-02",
      status: "active",
      stamp_count: 3,
      current_streak: 3,
      last_stamp_hkt_date: "2026-10-26",
      todayHkt: "2026-10-29",
    });
    expect(testRow.excluded_from_kpi).toBe(true);
  });

  it("filters rows by enrolled, last stamp, or in-range awards", () => {
    expect(
      stampProgressRowInHktRange({
        enrolledAtIso: "2026-10-02T00:00:00.000Z",
        lastStampHktDate: "2026-09-20",
        hasAwardInRange: false,
        startHkt: "2026-10-01",
        endHkt: "2026-10-31",
      })
    ).toBe(true);
    expect(
      stampProgressRowInHktRange({
        enrolledAtIso: "2026-08-01T00:00:00.000Z",
        lastStampHktDate: "2026-09-15",
        hasAwardInRange: false,
        startHkt: "2026-10-01",
        endHkt: "2026-10-31",
      })
    ).toBe(false);
    expect(
      stampProgressRowInHktRange({
        enrolledAtIso: "2026-08-01T00:00:00.000Z",
        lastStampHktDate: "2026-09-15",
        hasAwardInRange: true,
        startHkt: "2026-10-01",
        endHkt: "2026-10-31",
      })
    ).toBe(true);
  });

  it("computes KPI totals excluding test mobiles", () => {
    const totals = computeStampStudentProgressTotals([
      mapStampStudentProgressRow({
        stamp_card_id: "a",
        student_id: "1",
        student_name: "A",
        mobile_number: "65670000",
        enrolled_at: "2026-10-01T00:00:00.000Z",
        first_award_hkt_date: "2026-10-02",
        status: "active",
        stamp_count: 1,
        current_streak: 1,
        last_stamp_hkt_date: "2026-10-02",
        todayHkt: "2026-10-29",
      }),
      mapStampStudentProgressRow({
        stamp_card_id: "b",
        student_id: "2",
        student_name: "B",
        mobile_number: "99990000",
        enrolled_at: "2026-10-01T00:00:00.000Z",
        first_award_hkt_date: "2026-10-02",
        status: "active",
        stamp_count: 1,
        current_streak: 1,
        last_stamp_hkt_date: "2026-10-02",
        todayHkt: "2026-10-29",
      }),
    ]);
    expect(totals.row_count).toBe(2);
    expect(totals.kpi_row_count).toBe(1);
  });

  it("sorts progress rows by every column key", () => {
    const base = {
      enrolled_at: "2026-10-01T00:00:00.000Z",
      first_award_hkt_date: "2026-10-02",
      status: "active" as const,
      current_streak: 1,
      todayHkt: "2026-10-29",
    };
    const rowA = mapStampStudentProgressRow({
      ...base,
      stamp_card_id: "a",
      student_id: "1",
      student_name: "Amy",
      mobile_number: "11112222",
      stamp_count: 2,
      last_stamp_hkt_date: "2026-10-10",
    });
    const rowB = mapStampStudentProgressRow({
      ...base,
      stamp_card_id: "b",
      student_id: "2",
      student_name: "Bob",
      mobile_number: "33334444",
      stamp_count: 5,
      last_stamp_hkt_date: "2026-10-20",
    });
    const rows = [rowB, rowA];

    expect(sortStampStudentProgressRows(rows, "stamp_count", "asc").map((r) => r.stamp_card_id)).toEqual([
      "a",
      "b",
    ]);
    expect(sortStampStudentProgressRows(rows, "user_display", "asc").map((r) => r.stamp_card_id)).toEqual([
      "a",
      "b",
    ]);
    expect(
      sortStampStudentProgressRows(rows, "last_stamp_hkt_date", "desc").map((r) => r.stamp_card_id)
    ).toEqual(["b", "a"]);
  });

  it("toggles sort direction when the same column is clicked again", () => {
    expect(nextStampStudentProgressSortState(null, "asc", "stamp_count")).toEqual({
      key: "stamp_count",
      direction: "asc",
    });
    expect(nextStampStudentProgressSortState("stamp_count", "asc", "stamp_count")).toEqual({
      key: "stamp_count",
      direction: "desc",
    });
    expect(nextStampStudentProgressSortState("stamp_count", "desc", "student_name")).toEqual({
      key: "student_name",
      direction: "asc",
    });
  });
});
