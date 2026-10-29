"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STAMP_PROGRAM_AUDIT_EMPTY,
  STAMP_PROGRAM_OFF_NOTE,
  STAMP_REDEEM_REPORT_EMPTY,
  STAMP_REDEEM_REPORT_HEADERS,
  STAMP_GIFT_BTN_EXPORT_ALL,
  STAMP_GIFT_BTN_EXPORT_UNUSED,
  STAMP_GIFT_BTN_IMPORT_CSV,
  STAMP_ADMIN_PROGRESS_BTN_RESUME,
  STAMP_ADMIN_PROGRESS_EMPTY,
  STAMP_ADMIN_PROGRESS_FILTER_HINT,
  STAMP_ADMIN_PROGRESS_RESUME_CONFIRM,
  STAMP_ADMIN_PROGRESS_SECTION_TITLE,
  STAMP_STUDENT_PROGRESS_HEADERS,
  buildStampRedemptionReportCsv,
  formatStampGiftCodeCountsLine,
  formatStampProgramAuditLine,
  getAdminStampProgressDefaultDateRange,
  getStampGiftWindowBadge,
  shouldShowStampProgramAuditEmpty,
  stampGiftStatusLabel,
  stampGiftWindowBadgeLabel,
  type StampGiftInventoryRow,
  type StampGiftStatus,
  type StampProgramSettingsPayload,
  type StampRedemptionReportRow,
  type StampStudentProgressRow,
} from "@/lib/admin-stamp-card";
import { getHktCalendarDate } from "@/lib/practice-stamp-card";

type StampAdminAction =
  | "stamp_program_settings_get"
  | "stamp_program_settings_set_open"
  | "stamp_gift_list"
  | "stamp_gift_create"
  | "stamp_gift_update"
  | "stamp_gift_codes_import"
  | "stamp_gift_codes_export"
  | "stamp_redemption_report"
  | "stamp_student_progress_list"
  | "stamp_student_progress_resume";

async function stampAdminRequest<T>(
  action: StampAdminAction,
  sessionToken: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const res = await fetch("/api/admin/console", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ action, payload }),
  });
  const body = (await res.json()) as { data?: T; error?: string };
  if (!res.ok) throw new Error(body.error || "操作失敗");
  return body.data as T;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatHkd(value: number): string {
  return `HK$${value.toLocaleString("en-HK", { maximumFractionDigits: 0 })}`;
}

/** Sticky first column when gift table scrolls horizontally on narrow viewports. */
const GIFT_STICKY_NAME =
  "sticky left-0 z-10 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] sm:static sm:z-auto sm:shadow-none";
/** Redeem report: fixed-width sticky pair — col2 left offset must match col1 width to avoid overlap. */
const REPORT_STICKY_TIME =
  "sticky left-0 z-20 bg-white box-border w-[11.5rem] min-w-[11.5rem] max-w-[11.5rem] border-r border-gray-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] sm:static sm:z-auto sm:shadow-none sm:border-r-0";
const REPORT_STICKY_USER =
  "sticky left-[11.5rem] z-10 bg-white box-border min-w-[6.5rem] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] sm:static sm:z-auto sm:shadow-none";

export function PracticeStampAdminSection({ sessionToken }: { sessionToken: string }) {
  const todayHkt = useMemo(() => getHktCalendarDate(), []);
  const defaultProgressRange = useMemo(() => getAdminStampProgressDefaultDateRange(), []);

  const [program, setProgram] = useState<StampProgramSettingsPayload | null>(null);
  const [programLoading, setProgramLoading] = useState(true);
  const [programSaving, setProgramSaving] = useState(false);
  const [programError, setProgramError] = useState("");

  const [gifts, setGifts] = useState<StampGiftInventoryRow[]>([]);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [giftMsg, setGiftMsg] = useState("");

  const [showAddGift, setShowAddGift] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFaceValue, setNewFaceValue] = useState("");
  const [newWindowStart, setNewWindowStart] = useState(todayHkt);
  const [newWindowEnd, setNewWindowEnd] = useState(todayHkt);
  const [newStatus, setNewStatus] = useState<StampGiftStatus>("unlisted");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [creatingGift, setCreatingGift] = useState(false);

  const [importGiftId, setImportGiftId] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [reportRows, setReportRows] = useState<StampRedemptionReportRow[]>([]);
  const [reportTotals, setReportTotals] = useState({
    row_count: 0,
    kpi_row_count: 0,
    kpi_face_value_hkd_total: 0,
  });
  const [reportLoading, setReportLoading] = useState(true);
  const [reportGiftFilter, setReportGiftFilter] = useState("");
  const [reportEmailFilter, setReportEmailFilter] = useState("all");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");

  const [progressRows, setProgressRows] = useState<StampStudentProgressRow[]>([]);
  const [progressTotals, setProgressTotals] = useState({ row_count: 0, kpi_row_count: 0 });
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressStart, setProgressStart] = useState(defaultProgressRange.startHkt);
  const [progressEnd, setProgressEnd] = useState(defaultProgressRange.endHkt);
  const [progressMsg, setProgressMsg] = useState("");
  const [resumingCardId, setResumingCardId] = useState<string | null>(null);

  const loadProgram = useCallback(async () => {
    setProgramLoading(true);
    setProgramError("");
    try {
      const data = await stampAdminRequest<StampProgramSettingsPayload>(
        "stamp_program_settings_get",
        sessionToken
      );
      setProgram(data);
      if (data.error) setProgramError(data.error);
    } catch (err) {
      setProgram(null);
      setProgramError(err instanceof Error ? err.message : "無法載入活動設定");
    } finally {
      setProgramLoading(false);
    }
  }, [sessionToken]);

  const loadGifts = useCallback(async () => {
    setGiftsLoading(true);
    setGiftMsg("");
    try {
      const data = await stampAdminRequest<StampGiftInventoryRow[]>("stamp_gift_list", sessionToken);
      setGifts(data ?? []);
    } catch (err) {
      setGifts([]);
      setGiftMsg(err instanceof Error ? err.message : "禮品列表載入失敗");
    } finally {
      setGiftsLoading(false);
    }
  }, [sessionToken]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const data = await stampAdminRequest<{
        rows: StampRedemptionReportRow[];
        totals: typeof reportTotals;
      }>("stamp_redemption_report", sessionToken, {
        gift_id: reportGiftFilter || null,
        email_status: reportEmailFilter,
        start_hkt: reportStart || null,
        end_hkt: reportEnd || null,
      });
      setReportRows(data.rows ?? []);
      setReportTotals(data.totals ?? { row_count: 0, kpi_row_count: 0, kpi_face_value_hkd_total: 0 });
    } catch {
      setReportRows([]);
    } finally {
      setReportLoading(false);
    }
  }, [sessionToken, reportGiftFilter, reportEmailFilter, reportStart, reportEnd]);

  const loadProgress = useCallback(async () => {
    setProgressLoading(true);
    setProgressMsg("");
    try {
      const data = await stampAdminRequest<{
        rows: StampStudentProgressRow[];
        totals: typeof progressTotals;
      }>("stamp_student_progress_list", sessionToken, {
        start_hkt: progressStart || null,
        end_hkt: progressEnd || null,
      });
      setProgressRows(data.rows ?? []);
      setProgressTotals(data.totals ?? { row_count: 0, kpi_row_count: 0 });
    } catch (err) {
      setProgressRows([]);
      setProgressTotals({ row_count: 0, kpi_row_count: 0 });
      setProgressMsg(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setProgressLoading(false);
    }
  }, [sessionToken, progressStart, progressEnd]);

  useEffect(() => {
    void loadProgram();
    void loadGifts();
  }, [loadProgram, loadGifts]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const auditLine = formatStampProgramAuditLine(program?.audit ?? null);
  const showAuditPlaceholder = shouldShowStampProgramAuditEmpty({
    loading: programLoading,
    errorMessage: programError,
    program,
  });
  const programToggleDisabled = programLoading || Boolean(programError) || programSaving;

  const dismissAddGiftForm = () => {
    setShowAddGift(false);
    setNewName("");
    setNewFaceValue("");
    setNewImageUrl("");
    setNewWindowStart(todayHkt);
    setNewWindowEnd(todayHkt);
    setNewStatus("unlisted");
  };

  const handleToggleProgram = async () => {
    if (!program || programToggleDisabled) return;
    const nextOpen = !program.stamps_program_open;
    if (
      !nextOpen &&
      !window.confirm("確定要關閉印花計劃新報名？進行中的印花卡仍可繼續累積與換領。")
    ) {
      return;
    }
    setProgramSaving(true);
    setProgramError("");
    try {
      const data = await stampAdminRequest<StampProgramSettingsPayload>(
        "stamp_program_settings_set_open",
        sessionToken,
        { open: nextOpen }
      );
      setProgram(data);
      if (data.error) setProgramError(data.error);
    } catch (err) {
      setProgramError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setProgramSaving(false);
    }
  };

  const handleCreateGift = async () => {
    if (newStatus === "listed") {
      const ok = window.confirm("此禮品尚未匯入兌換碼（未用 0）。仍要上架嗎？");
      if (!ok) return;
    }
    setCreatingGift(true);
    setGiftMsg("");
    try {
      await stampAdminRequest("stamp_gift_create", sessionToken, {
        name_tc: newName,
        face_value_hkd: Number(newFaceValue),
        window_start_hkt: newWindowStart,
        window_end_hkt: newWindowEnd,
        status: newStatus,
        image_url: newImageUrl || null,
      });
      setShowAddGift(false);
      setNewName("");
      setNewFaceValue("");
      setNewImageUrl("");
      await loadGifts();
    } catch (err) {
      setGiftMsg(err instanceof Error ? err.message : "新增禮品失敗");
    } finally {
      setCreatingGift(false);
    }
  };

  const handleToggleGiftStatus = async (gift: StampGiftInventoryRow) => {
    const next: StampGiftStatus = gift.status === "listed" ? "unlisted" : "listed";
    if (next === "listed" && gift.code_unused === 0) {
      const ok = window.confirm(`「${gift.name_tc}」未用兌換碼為 0，仍要上架嗎？`);
      if (!ok) return;
    }
    const label = next === "listed" ? "上架" : "下架";
    if (!window.confirm(`確定要將「${gift.name_tc}」${label}？`)) return;
    setGiftMsg("");
    try {
      await stampAdminRequest("stamp_gift_update", sessionToken, { id: gift.id, status: next });
      await loadGifts();
    } catch (err) {
      setGiftMsg(err instanceof Error ? err.message : "更新狀態失敗");
    }
  };

  const handleImportCsv = async (giftId: string, file: File) => {
    if (!window.confirm("確定要匯入兌換碼？重複的碼會被略過。")) return;
    setImporting(true);
    setImportSummary("");
    setGiftMsg("");
    try {
      const csvText = await file.text();
      const result = await stampAdminRequest<{ summary_tc: string }>(
        "stamp_gift_codes_import",
        sessionToken,
        { gift_id: giftId, csv_text: csvText }
      );
      setImportSummary(result.summary_tc);
      await loadGifts();
    } catch (err) {
      setGiftMsg(err instanceof Error ? err.message : "匯入失敗");
    } finally {
      setImporting(false);
      setImportGiftId(null);
    }
  };

  const handleExportCodes = async (gift: StampGiftInventoryRow, scope: "unused" | "all") => {
    setGiftMsg("");
    try {
      const result = await stampAdminRequest<{ csv: string; scope: string }>(
        "stamp_gift_codes_export",
        sessionToken,
        { gift_id: gift.id, scope }
      );
      const suffix = scope === "unused" ? "unused" : "all";
      downloadCsv(`stamp-gift-${gift.id}-${suffix}.csv`, result.csv);
    } catch (err) {
      setGiftMsg(err instanceof Error ? err.message : "匯出失敗");
    }
  };

  const handleExportReport = () => {
    downloadCsv("stamp-redemption-report.csv", buildStampRedemptionReportCsv(reportRows));
  };

  const handleResumeProgress = async (row: StampStudentProgressRow) => {
    if (!row.resume_eligible) return;
    if (!window.confirm(STAMP_ADMIN_PROGRESS_RESUME_CONFIRM)) return;
    setResumingCardId(row.stamp_card_id);
    setProgressMsg("");
    try {
      await stampAdminRequest("stamp_student_progress_resume", sessionToken, {
        stamp_card_id: row.stamp_card_id,
      });
      await loadProgress();
    } catch (err) {
      setProgressMsg(err instanceof Error ? err.message : "恢復失敗");
    } finally {
      setResumingCardId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-800">活動設定</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">印花計劃開放</p>
            <p className="text-xs text-gray-500 mt-1">{STAMP_PROGRAM_OFF_NOTE}</p>
            {auditLine && <p className="text-xs text-gray-400 mt-2">{auditLine}</p>}
            {showAuditPlaceholder && (
              <p className="text-xs text-gray-400 mt-2">{STAMP_PROGRAM_AUDIT_EMPTY}</p>
            )}
            {programError && <p className="text-xs text-red-500 mt-2">{programError}</p>}
          </div>
          <button
            type="button"
            disabled={programToggleDisabled}
            onClick={() => void handleToggleProgram()}
            className={`relative inline-flex h-8 w-14 shrink-0 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              program?.stamps_program_open ? "bg-emerald-500 border-emerald-500" : "bg-gray-300 border-gray-300"
            }`}
            aria-pressed={program?.stamps_program_open ?? false}
            aria-label="印花計劃開放"
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform m-0.5 ${
                program?.stamps_program_open ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        {programLoading && <p className="text-xs text-gray-400">載入設定…</p>}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-800">禮品 inventory</h2>
          <button
            type="button"
            onClick={() => setShowAddGift((v) => !v)}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            新增禮品
          </button>
        </div>
        {giftMsg && <p className="text-sm text-red-500">{giftMsg}</p>}
        {importSummary && <p className="text-sm text-emerald-700">{importSummary}</p>}

        {showAddGift && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="禮品名稱（繁中）"
              className="w-full p-2 rounded-lg border border-gray-200 text-sm"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                value={newFaceValue}
                onChange={(e) => setNewFaceValue(e.target.value)}
                placeholder="面值 HK$"
                className="p-2 rounded-lg border border-gray-200 text-sm"
              />
              <input
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="禮品圖 URL（選填）"
                className="p-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-xs text-gray-500">
                窗口開始
                <input
                  type="date"
                  value={newWindowStart}
                  onChange={(e) => setNewWindowStart(e.target.value)}
                  className="mt-1 w-full p-2 rounded-lg border border-gray-200 text-sm"
                />
              </label>
              <label className="text-xs text-gray-500">
                窗口結束
                <input
                  type="date"
                  value={newWindowEnd}
                  onChange={(e) => setNewWindowEnd(e.target.value)}
                  className="mt-1 w-full p-2 rounded-lg border border-gray-200 text-sm"
                />
              </label>
            </div>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as StampGiftStatus)}
              className="p-2 rounded-lg border border-gray-200 text-sm"
            >
              <option value="unlisted">下架</option>
              <option value="listed">上架</option>
            </select>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={creatingGift || !newName.trim() || newFaceValue === ""}
                onClick={() => void handleCreateGift()}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {creatingGift ? "儲存中…" : "儲存禮品"}
              </button>
              <button
                type="button"
                disabled={creatingGift}
                onClick={dismissAddGiftForm}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-50"
              >
                取消
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            const giftId = importGiftId;
            e.target.value = "";
            if (file && giftId) void handleImportCsv(giftId, file);
          }}
        />

        {giftsLoading ? (
          <p className="text-sm text-gray-400">載入禮品…</p>
        ) : gifts.length === 0 ? (
          <p className="text-sm text-gray-400">尚未新增禮品</p>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="min-w-[640px] w-full text-sm text-left">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className={`py-2 pr-3 min-w-[7.5rem] ${GIFT_STICKY_NAME}`}>名稱</th>
                  <th className="py-2 pr-3 whitespace-nowrap">面值</th>
                  <th className="py-2 pr-3 whitespace-nowrap">換領窗口</th>
                  <th className="py-2 pr-3 whitespace-nowrap">數量</th>
                  <th className="py-2 pr-3 whitespace-nowrap">狀態</th>
                  <th className="py-2 pr-3 whitespace-nowrap min-w-[14rem]">操作</th>
                </tr>
              </thead>
              <tbody>
                {gifts.map((gift) => {
                  const badge = getStampGiftWindowBadge(
                    gift.window_start_hkt,
                    gift.window_end_hkt,
                    todayHkt
                  );
                  const badgeLabel = stampGiftWindowBadgeLabel(badge);
                  return (
                    <tr key={gift.id} className="border-b border-gray-100 align-top">
                      <td className={`py-2 pr-3 ${GIFT_STICKY_NAME}`}>
                        <p className="font-semibold text-gray-800">{gift.name_tc}</p>
                        {gift.image_url && (
                          <p className="text-xs text-indigo-600 truncate max-w-[10rem] mt-0.5">
                            {gift.image_url}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatHkd(gift.face_value_hkd)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-xs text-gray-600">
                        {gift.window_start_hkt} — {gift.window_end_hkt}
                        {badgeLabel && (
                          <span className="ml-1 inline-block text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            {badgeLabel}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-xs text-gray-600">
                        {formatStampGiftCodeCountsLine(
                          gift.code_total,
                          gift.code_unused,
                          gift.code_used
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {stampGiftStatusLabel(gift.status)}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setImportGiftId(gift.id);
                              fileInputRef.current?.click();
                            }}
                            disabled={importing}
                            className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-indigo-300"
                          >
                            {STAMP_GIFT_BTN_IMPORT_CSV}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExportCodes(gift, "unused")}
                            className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-indigo-300"
                          >
                            {STAMP_GIFT_BTN_EXPORT_UNUSED}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExportCodes(gift, "all")}
                            className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-indigo-300"
                          >
                            {STAMP_GIFT_BTN_EXPORT_ALL}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleGiftStatus(gift)}
                            className="px-2 py-1 rounded-lg bg-gray-800 text-white text-xs font-semibold"
                          >
                            {gift.status === "listed" ? "下架" : "上架"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-800">兌換報表</h2>
          <button
            type="button"
            onClick={handleExportReport}
            disabled={reportRows.length === 0}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            匯出 CSV
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-gray-500">
            開始日期
            <input
              type="date"
              value={reportStart}
              onChange={(e) => setReportStart(e.target.value)}
              className="mt-1 block p-2 rounded-lg border border-gray-200 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            結束日期
            <input
              type="date"
              value={reportEnd}
              onChange={(e) => setReportEnd(e.target.value)}
              className="mt-1 block p-2 rounded-lg border border-gray-200 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            禮品
            <select
              value={reportGiftFilter}
              onChange={(e) => setReportGiftFilter(e.target.value)}
              className="mt-1 block p-2 rounded-lg border border-gray-200 text-sm min-w-[140px]"
            >
              <option value="">全部</option>
              {gifts.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name_tc}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            電郵狀態
            <select
              value={reportEmailFilter}
              onChange={(e) => setReportEmailFilter(e.target.value)}
              className="mt-1 block p-2 rounded-lg border border-gray-200 text-sm"
            >
              <option value="all">全部</option>
              <option value="sent">已發送</option>
              <option value="failed">失敗</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={reportLoading}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {reportLoading ? "載入中…" : "套用篩選"}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          KPI 面值總計（不含 9999 測試帳戶）：HK$
          {reportTotals.kpi_face_value_hkd_total.toLocaleString("en-HK")} · {reportTotals.kpi_row_count}{" "}
          筆
        </p>

        <div className="overflow-x-auto -mx-1 px-1">
          <table className="min-w-[720px] w-full text-sm text-left table-fixed sm:table-auto">
            <colgroup>
              <col className="w-[11.5rem]" />
              <col className="w-[6.5rem]" />
            </colgroup>
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                <th className={`py-2 pr-3 whitespace-nowrap ${REPORT_STICKY_TIME}`}>
                  {STAMP_REDEEM_REPORT_HEADERS[0]}
                </th>
                <th className={`py-2 pr-3 whitespace-nowrap ${REPORT_STICKY_USER}`}>
                  {STAMP_REDEEM_REPORT_HEADERS[1]}
                </th>
                {STAMP_REDEEM_REPORT_HEADERS.slice(2).map((h) => (
                  <th key={h} className="py-2 pr-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportLoading ? (
                <tr>
                  <td colSpan={STAMP_REDEEM_REPORT_HEADERS.length} className="py-6 text-center text-gray-400">
                    載入中…
                  </td>
                </tr>
              ) : reportRows.length === 0 ? (
                <tr>
                  <td colSpan={STAMP_REDEEM_REPORT_HEADERS.length} className="py-6 text-center text-gray-400">
                    {STAMP_REDEEM_REPORT_EMPTY}
                  </td>
                </tr>
              ) : (
                reportRows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className={`py-2 pr-3 whitespace-nowrap ${REPORT_STICKY_TIME}`}>
                      {row.redeemed_at_hkt}
                    </td>
                    <td className={`py-2 pr-3 font-mono whitespace-nowrap ${REPORT_STICKY_USER}`}>
                      {row.user_display}
                    </td>
                    <td className="py-2 pr-3">{row.gift_name || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {row.face_value_hkd === null ? "—" : formatHkd(row.face_value_hkd)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.ecoupon_code || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{row.email_sent_at_hkt || "—"}</td>
                    <td className="py-2 pr-3">{row.admin_actor || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-800">{STAMP_ADMIN_PROGRESS_SECTION_TITLE}</h2>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-gray-500">
            開始日期
            <input
              type="date"
              value={progressStart}
              onChange={(e) => setProgressStart(e.target.value)}
              className="mt-1 block p-2 rounded-lg border border-gray-200 text-sm"
            />
          </label>
          <label className="text-xs text-gray-500">
            結束日期
            <input
              type="date"
              value={progressEnd}
              onChange={(e) => setProgressEnd(e.target.value)}
              className="mt-1 block p-2 rounded-lg border border-gray-200 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadProgress()}
            disabled={progressLoading}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {progressLoading ? "載入中…" : "套用篩選"}
          </button>
        </div>

        <p className="text-xs text-gray-500">{STAMP_ADMIN_PROGRESS_FILTER_HINT}</p>
        <p className="text-xs text-gray-500">
          進行中（不含 9999 測試帳戶）：{progressTotals.kpi_row_count} 人 · {progressTotals.row_count}{" "}
          筆
        </p>
        {progressMsg && <p className="text-sm text-red-500">{progressMsg}</p>}

        <div className="overflow-x-auto -mx-1 px-1">
          <table className="min-w-[720px] w-full text-sm text-left table-fixed sm:table-auto">
            <colgroup>
              <col className="w-[6.5rem]" />
              <col className="w-[6.5rem]" />
            </colgroup>
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                {STAMP_STUDENT_PROGRESS_HEADERS.map((h, index) => (
                  <th
                    key={h}
                    className={`py-2 pr-3 whitespace-nowrap ${
                      index === 2 ? REPORT_STICKY_USER : index === 0 ? REPORT_STICKY_TIME : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {progressLoading ? (
                <tr>
                  <td colSpan={STAMP_STUDENT_PROGRESS_HEADERS.length} className="py-6 text-center text-gray-400">
                    載入中…
                  </td>
                </tr>
              ) : progressRows.length === 0 ? (
                <tr>
                  <td colSpan={STAMP_STUDENT_PROGRESS_HEADERS.length} className="py-6 text-center text-gray-400">
                    {STAMP_ADMIN_PROGRESS_EMPTY}
                  </td>
                </tr>
              ) : (
                progressRows.map((row) => (
                  <tr key={row.stamp_card_id} className="border-b border-gray-100">
                    <td className={`py-2 pr-3 whitespace-nowrap ${REPORT_STICKY_TIME}`}>
                      {row.start_date_hkt}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{row.effective_streak}</td>
                    <td className={`py-2 pr-3 font-mono whitespace-nowrap ${REPORT_STICKY_USER}`}>
                      {row.user_display}
                    </td>
                    <td className="py-2 pr-3">{row.student_name}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {row.stamp_count}
                      {row.excluded_from_kpi ? (
                        <span className="ml-1 text-xs text-amber-600">測試</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{row.card_status_label}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{row.last_stamp_hkt_date || "—"}</td>
                    <td className="py-2 pr-3">
                      {row.resume_eligible ? (
                        <button
                          type="button"
                          disabled={resumingCardId === row.stamp_card_id}
                          onClick={() => void handleResumeProgress(row)}
                          className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {resumingCardId === row.stamp_card_id ? "處理中…" : STAMP_ADMIN_PROGRESS_BTN_RESUME}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
