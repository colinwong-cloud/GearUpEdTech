"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STAMP_PROGRAM_OFF_NOTE,
  STAMP_REDEEM_REPORT_EMPTY,
  STAMP_REDEEM_REPORT_HEADERS,
  buildStampRedemptionReportCsv,
  formatStampProgramAuditLine,
  getStampGiftWindowBadge,
  stampGiftStatusLabel,
  stampGiftWindowBadgeLabel,
  type StampGiftInventoryRow,
  type StampGiftStatus,
  type StampProgramSettingsPayload,
  type StampRedemptionReportRow,
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
  | "stamp_redemption_report";

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

export function PracticeStampAdminSection({ sessionToken }: { sessionToken: string }) {
  const todayHkt = useMemo(() => getHktCalendarDate(), []);

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

  useEffect(() => {
    void loadProgram();
    void loadGifts();
  }, [loadProgram, loadGifts]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const auditLine = formatStampProgramAuditLine(program?.audit ?? null);
  const programToggleDisabled = programLoading || Boolean(programError) || programSaving;

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

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-800">活動設定</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">印花計劃開放</p>
            <p className="text-xs text-gray-500 mt-1">{STAMP_PROGRAM_OFF_NOTE}</p>
            {auditLine && <p className="text-xs text-gray-400 mt-2">{auditLine}</p>}
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
            <button
              type="button"
              disabled={creatingGift || !newName.trim() || newFaceValue === ""}
              onClick={() => void handleCreateGift()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {creatingGift ? "儲存中…" : "儲存禮品"}
            </button>
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
          <div className="space-y-3">
            {gifts.map((gift) => {
              const badge = getStampGiftWindowBadge(
                gift.window_start_hkt,
                gift.window_end_hkt,
                todayHkt
              );
              const badgeLabel = stampGiftWindowBadgeLabel(badge);
              return (
                <div
                  key={gift.id}
                  className="rounded-xl border border-gray-100 p-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-800 text-sm">{gift.name_tc}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {stampGiftStatusLabel(gift.status)}
                      </span>
                      {badgeLabel && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                          {badgeLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      面值 {formatHkd(gift.face_value_hkd)} · 換領窗口 {gift.window_start_hkt} —{" "}
                      {gift.window_end_hkt}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      數量 總 {gift.code_total} / 未用 {gift.code_unused} / 已用 {gift.code_used}
                    </p>
                    {gift.image_url && (
                      <p className="text-xs text-indigo-600 truncate mt-1">{gift.image_url}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setImportGiftId(gift.id);
                        fileInputRef.current?.click();
                      }}
                      disabled={importing}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-indigo-300"
                    >
                      匯入兌換碼 CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportCodes(gift, "unused")}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-indigo-300"
                    >
                      匯出未用碼
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportCodes(gift, "all")}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-indigo-300"
                    >
                      匯出全部碼
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleGiftStatus(gift)}
                      className="px-2 py-1.5 rounded-lg bg-gray-800 text-white text-xs font-semibold"
                    >
                      {gift.status === "listed" ? "下架" : "上架"}
                    </button>
                  </div>
                </div>
              );
            })}
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

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                {STAMP_REDEEM_REPORT_HEADERS.map((h) => (
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
                    <td className="py-2 pr-3 whitespace-nowrap">{row.redeemed_at_hkt}</td>
                    <td className="py-2 pr-3 font-mono">{row.user_display}</td>
                    <td className="py-2 pr-3">{row.gift_name || "—"}</td>
                    <td className="py-2 pr-3">
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
    </div>
  );
}
