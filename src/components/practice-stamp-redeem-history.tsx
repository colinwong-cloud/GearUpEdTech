"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  STAMP_REDEEM_HISTORY_EMPTY,
  STAMP_REDEEM_HISTORY_HEADERS,
  formatStampRedeemDateHkt,
  formatStampRedeemEmailStatus,
  formatStampRedeemFaceValue,
  loadStudentStampRedeemHistory,
  type StudentStampRedeemHistoryRow,
} from "@/lib/practice-stamp-card-ui";

const HEADER_COL_COUNT = STAMP_REDEEM_HISTORY_HEADERS.length;

function RedeemHistoryTable({ body }: { body: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {STAMP_REDEEM_HISTORY_HEADERS.map((label) => (
              <th key={label} className="whitespace-nowrap px-3 py-2 font-semibold text-gray-500">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{body}</tbody>
      </table>
    </div>
  );
}

export function PracticeStampRedeemHistory({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<StudentStampRedeemHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const result = await loadStudentStampRedeemHistory(studentId);
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setRows([]);
      } else {
        setRows(result.rows);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const copyCode = useCallback(async (row: StudentStampRedeemHistoryRow) => {
    const code = row.ecoupon_code?.trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(row.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }, []);

  let tableBody: ReactNode;
  if (loading) {
    tableBody = (
      <tr>
        <td colSpan={HEADER_COL_COUNT} className="px-3 py-8 text-center text-sm text-gray-400">
          載入兌換紀錄…
        </td>
      </tr>
    );
  } else if (error) {
    tableBody = (
      <tr>
        <td colSpan={HEADER_COL_COUNT} className="px-3 py-4 text-center text-sm text-amber-900">
          {error}
        </td>
      </tr>
    );
  } else if (rows.length === 0) {
    tableBody = (
      <tr>
        <td colSpan={HEADER_COL_COUNT} className="px-3 py-8 text-center text-sm text-gray-400">
          {STAMP_REDEEM_HISTORY_EMPTY}
        </td>
      </tr>
    );
  } else {
    tableBody = rows.map((row) => {
      const emailDisplay = formatStampRedeemEmailStatus(row.email_status);
      return (
        <tr key={row.id}>
          <td className="whitespace-nowrap px-3 py-2 text-gray-600">
            {formatStampRedeemDateHkt(row.redeemed_at_hkt)}
          </td>
          <td className="px-3 py-2 text-gray-800">{row.gift_name || "—"}</td>
          <td className="whitespace-nowrap px-3 py-2 text-gray-700">
            {formatStampRedeemFaceValue(row.face_value_hkd)}
          </td>
          <td className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-800">
                {row.ecoupon_code?.trim() || "—"}
              </code>
              {row.ecoupon_code?.trim() ? (
                <button
                  type="button"
                  onClick={() => void copyCode(row)}
                  className="rounded-lg border border-sky-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-50"
                >
                  {copiedId === row.id ? "已複製" : "複製"}
                </button>
              ) : null}
            </div>
          </td>
          <td className="px-3 py-2 text-gray-700">
            {emailDisplay.kind === "sent" ? (
              <span className="text-emerald-700">{emailDisplay.label}</span>
            ) : emailDisplay.kind === "failed" ? (
              <span className="text-red-700">
                {emailDisplay.label}
                <span className="mt-0.5 block text-[11px] font-normal text-red-600/90">
                  {emailDisplay.retryHint}
                </span>
              </span>
            ) : (
              <span className="text-gray-500">{emailDisplay.label}</span>
            )}
          </td>
        </tr>
      );
    });
  }

  return (
    <section aria-labelledby="stamp-redeem-history-heading" className="space-y-3">
      <h2 id="stamp-redeem-history-heading" className="text-base font-bold text-gray-900">
        兌換紀錄
      </h2>
      <RedeemHistoryTable body={tableBody} />
    </section>
  );
}
