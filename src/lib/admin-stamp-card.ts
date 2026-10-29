/** Admin practice stamp card — Phase 4 (program toggle, gift CSV, redeem report). */

import {
  effectivePracticeStampStreak,
  getHktCalendarDate,
  isExcludedTestMobileForKpi,
} from "@/lib/practice-stamp-card";

export const STAMP_PROGRAM_OFF_NOTE =
  "關閉後不可新報名；進行中印花卡可繼續累積與換領";

/** Shown when program settings load but no toggle audit row exists yet. */
export const STAMP_PROGRAM_AUDIT_EMPTY = "尚未有更新紀錄";

/** Growth-locked admin gift inventory copy (BRIEF Phase 4). */
export const STAMP_GIFT_BTN_IMPORT_CSV = "匯入兌換碼 CSV";
export const STAMP_GIFT_BTN_EXPORT_UNUSED = "匯出未用碼";
export const STAMP_GIFT_BTN_EXPORT_ALL = "匯出全部碼";

export function formatStampGiftCodeCountsLine(
  total: number,
  unused: number,
  used: number
): string {
  return `總碼 ${total} / 未用 ${unused} / 已用 ${used}`;
}

export const STAMP_GIFT_CODE_IMPORT_SUMMARY_LABEL = "接受";
export const STAMP_REDEEM_REPORT_EMPTY = "尚未有兌換紀錄";

export type StampGiftStatus = "listed" | "unlisted";

export type StampProgramSettingsPayload = {
  stamps_program_open: boolean;
  audit: {
    toggled_at_hkt: string | null;
    admin_identifier: string | null;
  } | null;
  error?: string;
};

export type StampGiftInventoryRow = {
  id: string;
  name_tc: string;
  face_value_hkd: number;
  window_start_hkt: string;
  window_end_hkt: string;
  status: StampGiftStatus;
  image_url: string | null;
  code_total: number;
  code_unused: number;
  code_used: number;
};

export type StampGiftCodeImportResult = {
  accepted: number;
  duplicate: number;
  failed: number;
  summary_tc: string;
};

export type StampRedemptionReportRow = {
  id: string;
  redeemed_at_hkt: string;
  user_display: string;
  gift_name: string | null;
  face_value_hkd: number | null;
  ecoupon_code: string | null;
  email_sent_at_hkt: string | null;
  email_status: string | null;
  admin_actor: string | null;
  mobile_number: string | null;
  excluded_from_kpi: boolean;
};

export type StampRedemptionReportTotals = {
  row_count: number;
  kpi_row_count: number;
  kpi_face_value_hkd_total: number;
};

export function formatStampProgramAuditLine(
  audit: StampProgramSettingsPayload["audit"]
): string | null {
  if (!audit?.toggled_at_hkt) return null;
  const admin = audit.admin_identifier?.trim() || "admin";
  return `上次更新：${audit.toggled_at_hkt} (HKT) · ${admin}`;
}

/**
 * Muted placeholder under the program toggle — only before the first audit row exists.
 * When `audit.toggled_at_hkt` is present, use {@link formatStampProgramAuditLine} instead.
 */
export function shouldShowStampProgramAuditEmpty(input: {
  loading: boolean;
  errorMessage: string;
  program: StampProgramSettingsPayload | null;
}): boolean {
  if (input.loading || input.errorMessage || !input.program) return false;
  if (input.program.error) return false;
  return !input.program.audit?.toggled_at_hkt;
}

export function buildStampProgramSettingsPayload(input: {
  open: boolean;
  auditRow: {
    toggled_at: string;
    admin_identifier: string;
  } | null;
}): StampProgramSettingsPayload {
  const audit = input.auditRow
    ? {
        toggled_at_hkt: formatIsoToHktDateTime(input.auditRow.toggled_at),
        admin_identifier: input.auditRow.admin_identifier,
      }
    : null;
  return {
    stamps_program_open: input.open,
    audit,
  };
}

export function formatIsoToHktDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/\//g, "-");
}

export function maskAdminUserMobile(mobile: string | null | undefined): string {
  const raw = (mobile ?? "").trim();
  if (!raw) return "—";
  if (raw.length <= 4) return `${raw}****`;
  return `${raw.slice(0, 4)}****`;
}

export function stampGiftStatusLabel(status: StampGiftStatus): string {
  return status === "listed" ? "上架" : "下架";
}

export type StampGiftWindowBadge = "current" | "future" | "past" | null;

export function getStampGiftWindowBadge(
  startHkt: string,
  endHkt: string,
  todayHkt: string = getHktCalendarDate()
): StampGiftWindowBadge {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startHkt) || !/^\d{4}-\d{2}-\d{2}$/.test(endHkt)) {
    return null;
  }
  if (todayHkt < startHkt) return "future";
  if (todayHkt > endHkt) return "past";
  return "current";
}

export function stampGiftWindowBadgeLabel(badge: StampGiftWindowBadge): string | null {
  if (badge === "future") return "尚未開始";
  if (badge === "past") return "已結束";
  if (badge === "current") return "進行中";
  return null;
}

export function parseGiftCodeCsv(text: string): {
  codes: string[];
  failed: number;
} {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length === 0) return { codes: [], failed: 0 };

  const headerLine = (lines[0] ?? "").trim();
  const headerCols = splitCsvLine(headerLine).map((c) => c.trim().toLowerCase());
  const codeIndex = headerCols.indexOf("code");
  const hasHeader = codeIndex >= 0;
  const startRow = hasHeader ? 1 : 0;

  const codes: string[] = [];
  let failed = 0;

  for (let i = startRow; i < lines.length; i += 1) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const cols = splitCsvLine(line);
    const raw = hasHeader ? cols[codeIndex] : cols[0];
    const code = normalizeGiftCode(raw);
    if (!code) {
      failed += 1;
      continue;
    }
    codes.push(code);
  }
  return { codes, failed };
}

export function classifyGiftCodeImport(
  parsedCodes: string[],
  parseFailed: number,
  existingCodes: Set<string>
): StampGiftCodeImportResult {
  const seenInFile = new Set<string>();
  let accepted = 0;
  let duplicate = 0;
  const failed = parseFailed;

  for (const code of parsedCodes) {
    if (seenInFile.has(code) || existingCodes.has(code)) {
      duplicate += 1;
      continue;
    }
    seenInFile.add(code);
    accepted += 1;
  }

  return {
    accepted,
    duplicate,
    failed,
    summary_tc: `${STAMP_GIFT_CODE_IMPORT_SUMMARY_LABEL} ${accepted} · 重複 ${duplicate} · 失敗 ${failed}`,
  };
}

export function buildGiftCodesExportCsv(
  rows: { code: string; status: string; used_at: string | null }[]
): string {
  const headers = ["code", "status", "used_at"];
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : String(value);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const body = rows.map((row) =>
    [row.code, row.status, row.used_at ?? ""].map(escape).join(",")
  );
  return [headers.join(","), ...body].join("\n");
}

export const STAMP_REDEEM_REPORT_HEADERS = [
  "兌換時間 (HKT)",
  "用戶",
  "禮品名稱",
  "面值 (HK$)",
  "兌換碼",
  "電郵發送時間",
  "管理員",
] as const;

export function buildStampRedemptionReportCsv(rows: StampRedemptionReportRow[]): string {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : String(value);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const body = rows.map((row) =>
    [
      row.redeemed_at_hkt,
      row.user_display,
      row.gift_name ?? "",
      row.face_value_hkd ?? "",
      row.ecoupon_code ?? "",
      row.email_sent_at_hkt ?? "",
      row.admin_actor ?? "",
    ]
      .map(escape)
      .join(",")
  );
  return [STAMP_REDEEM_REPORT_HEADERS.join(","), ...body].join("\n");
}

export function computeStampRedemptionReportTotals(
  rows: StampRedemptionReportRow[]
): StampRedemptionReportTotals {
  let kpiRowCount = 0;
  let kpiFaceValue = 0;
  for (const row of rows) {
    if (row.excluded_from_kpi) continue;
    kpiRowCount += 1;
    kpiFaceValue += Math.max(0, Number(row.face_value_hkd) || 0);
  }
  return {
    row_count: rows.length,
    kpi_row_count: kpiRowCount,
    kpi_face_value_hkd_total: kpiFaceValue,
  };
}

export function mapRedemptionRowForReport(input: {
  id: string;
  redeemed_at: string;
  gift_name: string | null;
  face_value_hkd: number | null;
  ecoupon_code: string | null;
  email_sent_at: string | null;
  email_status: string | null;
  admin_actor: string | null;
  mobile_number: string | null;
}): StampRedemptionReportRow {
  const excluded = isExcludedTestMobileForKpi(input.mobile_number);
  return {
    id: input.id,
    redeemed_at_hkt: formatIsoToHktDateTime(input.redeemed_at),
    user_display: maskAdminUserMobile(input.mobile_number),
    gift_name: input.gift_name,
    face_value_hkd: input.face_value_hkd,
    ecoupon_code: input.ecoupon_code,
    email_sent_at_hkt: input.email_sent_at
      ? formatIsoToHktDateTime(input.email_sent_at)
      : null,
    email_status: input.email_status,
    admin_actor: input.admin_actor,
    mobile_number: input.mobile_number,
    excluded_from_kpi: excluded,
  };
}

export function formatStampRedeemEmailStatusFilter(value: string): "sent" | "failed" | null {
  if (value === "sent" || value === "已發送") return "sent";
  if (value === "failed" || value === "失敗") return "failed";
  return null;
}

function normalizeGiftCode(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (text.length > 256) return null;
  return text;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function isMissingStampInventoryTableError(message: string): boolean {
  return /stamp_gifts|stamp_gift_codes|42P01|PGRST205|does not exist|Could not find the table/i.test(
    message
  );
}

export const STAMP_INVENTORY_TABLE_HINT =
  "缺少印花禮品資料表，請先在 Supabase 執行 supabase_practice_stamp_card_phase4_inventory.sql（需 Team 批准）。";

export const STAMP_ADMIN_PROGRESS_SECTION_TITLE = "學生印花進度";
export const STAMP_ADMIN_PROGRESS_EMPTY = "此日期範圍內沒有進行中的印花紀錄";
export const STAMP_ADMIN_PROGRESS_BTN_RESUME = "恢復";
export const STAMP_ADMIN_PROGRESS_RESUME_CONFIRM =
  "確定要恢復此學生的連續練習進度？系統會將最後蓋印日期調整為昨日（HKT），以便下次合資格練習可延續原有連續天數與蓋印數。";
export const STAMP_ADMIN_PROGRESS_FILTER_HINT =
  "篩選：最後蓋印日、報名日或範圍內任一蓋印日符合即顯示（HKT）";
export const STAMP_ADMIN_PROGRESS_RESUME_RPC_HINT =
  "缺少恢復功能，請先在 Supabase 執行 supabase_practice_stamp_card_phase6_admin_progress.sql（需 Colin 批准）。";

export const STAMP_STUDENT_PROGRESS_HEADERS = [
  "開始日期 (HKT)",
  "連續天數",
  "用戶",
  "學生姓名",
  "蓋印數",
  "卡狀態",
  "最後蓋印 (HKT)",
  "操作",
] as const;

export type StampStudentProgressRow = {
  stamp_card_id: string;
  student_id: string;
  user_display: string;
  student_name: string;
  start_date_hkt: string;
  effective_streak: number;
  stored_streak: number;
  stamp_count: number;
  card_status: "active" | "redeemed";
  card_status_label: string;
  last_stamp_hkt_date: string | null;
  enrolled_at_hkt: string;
  resume_eligible: boolean;
  excluded_from_kpi: boolean;
};

export type StampStudentProgressTotals = {
  row_count: number;
  kpi_row_count: number;
};

/** Month-to-date in Asia/Hong_Kong (inclusive through today HKT). */
export function getAdminStampProgressDefaultDateRange(now: Date = new Date()): {
  startHkt: string;
  endHkt: string;
} {
  const endHkt = getHktCalendarDate(now);
  const monthStart = `${endHkt.slice(0, 7)}-01`;
  return { startHkt: monthStart, endHkt };
}

export function isoToHktCalendarDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return getHktCalendarDate(date);
}

/**
 * 開始日期：首次蓋印 HKT 日；若尚未蓋印則為報名日（enrolled_at HKT）。
 */
export function resolveStampProgressStartDateHkt(
  enrolledAtIso: string,
  firstAwardHktDate: string | null
): string {
  if (firstAwardHktDate) return firstAwardHktDate;
  return isoToHktCalendarDate(enrolledAtIso);
}

export function stampCardStatusLabelTc(status: string): "進行中" | "已兌換" | string {
  if (status === "active") return "進行中";
  if (status === "redeemed") return "已兌換";
  return status;
}

export function isStampProgressResumeEligible(input: {
  todayHkt: string;
  status: string;
  stampCount: number;
  storedStreak: number;
  lastStampHktDate: string | null;
}): boolean {
  if (input.status !== "active") return false;
  if (input.stampCount <= 0 || input.storedStreak <= 0) return false;
  if (!input.lastStampHktDate) return false;
  const effective = effectivePracticeStampStreak(
    input.lastStampHktDate,
    input.todayHkt,
    input.storedStreak
  );
  if (effective > 0) return false;
  const yesterday = previousHktDateForAdmin(input.todayHkt);
  return input.lastStampHktDate < yesterday;
}

function previousHktDateForAdmin(hktDate: string): string {
  const [y, m, d] = hktDate.split("-").map(Number);
  const utcMs = Date.UTC(y, m - 1, d, 12, 0, 0) - 8 * 60 * 60 * 1000;
  const prev = new Date(utcMs - 24 * 60 * 60 * 1000);
  return getHktCalendarDate(prev);
}

export function stampProgressRowInHktRange(input: {
  enrolledAtIso: string;
  lastStampHktDate: string | null;
  hasAwardInRange: boolean;
  startHkt: string;
  endHkt: string;
}): boolean {
  if (!input.startHkt || !input.endHkt) return true;
  if (input.hasAwardInRange) return true;
  const enrolled = isoToHktCalendarDate(input.enrolledAtIso);
  if (enrolled >= input.startHkt && enrolled <= input.endHkt) return true;
  const last = input.lastStampHktDate;
  if (last && last >= input.startHkt && last <= input.endHkt) return true;
  return false;
}

export function computeStampStudentProgressTotals(
  rows: StampStudentProgressRow[]
): StampStudentProgressTotals {
  let kpiRowCount = 0;
  for (const row of rows) {
    if (!row.excluded_from_kpi) kpiRowCount += 1;
  }
  return { row_count: rows.length, kpi_row_count: kpiRowCount };
}

export function mapStampStudentProgressRow(input: {
  stamp_card_id: string;
  student_id: string;
  student_name: string | null;
  mobile_number: string | null;
  enrolled_at: string;
  first_award_hkt_date: string | null;
  status: string;
  stamp_count: number;
  current_streak: number;
  last_stamp_hkt_date: string | null;
  todayHkt: string;
}): StampStudentProgressRow {
  const excluded = isExcludedTestMobileForKpi(input.mobile_number);
  const cardStatus =
    input.status === "redeemed" ? ("redeemed" as const) : ("active" as const);
  const storedStreak = Math.max(0, Number(input.current_streak) || 0);
  const effectiveStreak = effectivePracticeStampStreak(
    input.last_stamp_hkt_date,
    input.todayHkt,
    storedStreak
  );
  return {
    stamp_card_id: input.stamp_card_id,
    student_id: input.student_id,
    user_display: maskAdminUserMobile(input.mobile_number),
    student_name: (input.student_name ?? "").trim() || "—",
    start_date_hkt: resolveStampProgressStartDateHkt(
      input.enrolled_at,
      input.first_award_hkt_date
    ),
    effective_streak: effectiveStreak,
    stored_streak: storedStreak,
    stamp_count: Math.max(0, Number(input.stamp_count) || 0),
    card_status: cardStatus,
    card_status_label: stampCardStatusLabelTc(cardStatus),
    last_stamp_hkt_date: input.last_stamp_hkt_date,
    enrolled_at_hkt: isoToHktCalendarDate(input.enrolled_at),
    resume_eligible: isStampProgressResumeEligible({
      todayHkt: input.todayHkt,
      status: cardStatus,
      stampCount: Math.max(0, Number(input.stamp_count) || 0),
      storedStreak,
      lastStampHktDate: input.last_stamp_hkt_date,
    }),
    excluded_from_kpi: excluded,
  };
}

export function isMissingStampProgressResumeRpcError(message: string): boolean {
  return /admin_stamp_student_progress_resume|student_stamp_card_resume_audit|42883|PGRST202|does not exist|Could not find the function/i.test(
    message
  );
}
