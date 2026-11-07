"use client";

import { useState } from "react";
import {
  STAMP_ADMIN_ADJUST_AMOUNT_HELPER,
  STAMP_ADMIN_ADJUST_AMOUNT_INVALID,
  STAMP_ADMIN_ADJUST_AMOUNT_LABEL,
  STAMP_ADMIN_ADJUST_AMOUNT_PLACEHOLDER,
  STAMP_ADMIN_ADJUST_CANCEL_CTA,
  STAMP_ADMIN_ADJUST_CLAMP_REJECT,
  STAMP_ADMIN_ADJUST_CONFIRM_CTA,
  STAMP_ADMIN_ADJUST_CONFIRM_TITLE,
  STAMP_ADMIN_ADJUST_COUNT_LABEL,
  STAMP_ADMIN_ADJUST_LAST_NONE,
  STAMP_ADMIN_ADJUST_LAST_PREFIX,
  STAMP_ADMIN_ADJUST_LIST_HEADING,
  STAMP_ADMIN_ADJUST_LOOKUP_IDLE,
  STAMP_ADMIN_ADJUST_LOOKUP_LOADING,
  STAMP_ADMIN_ADJUST_LOOKUP_PLACEHOLDER,
  STAMP_ADMIN_ADJUST_NEED_STUDENT,
  STAMP_ADMIN_ADJUST_NO_ACTIVE_CARD,
  STAMP_ADMIN_ADJUST_NO_STUDENTS,
  STAMP_ADMIN_ADJUST_PRIMARY_CTA,
  STAMP_ADMIN_ADJUST_SEARCH_FAIL,
  STAMP_ADMIN_ADJUST_SECTION_HELPER,
  STAMP_ADMIN_ADJUST_SECTION_TITLE,
  STAMP_ADMIN_ADJUST_STATUS_PREFIX,
  STAMP_ADMIN_ADJUST_STREAK_LABEL,
  STAMP_ADMIN_ADJUST_UNKNOWN_MOBILE,
  STAMP_ADMIN_ADJUST_WRITE_FAIL,
  formatStampAdminAdjustConfirmBody,
  formatStampAdminAdjustLastOpDetail,
  formatStampAdminAdjustParentLine,
  formatStampAdminAdjustStudentLine,
  formatStampAdminAdjustSuccessMessage,
  parseAdminResumeTargetStampCount,
  type StampAdminAdjustCardView,
} from "@/lib/admin-stamp-card";
import { PRACTICE_STAMP_CARD_SIZE } from "@/lib/practice-stamp-card";

type StampAdjustAdminAction =
  | "search_parent"
  | "stamp_student_adjust_card_get"
  | "stamp_student_set_progress";

type ParentSearchStudent = {
  student: { id: string; student_name: string | null; grade_level: string | null };
};

type ParentSearchResult = {
  parent: { mobile_number: string; parent_name: string | null };
  students: ParentSearchStudent[];
};

async function stampAdjustAdminRequest<T>(
  action: StampAdjustAdminAction,
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
  if (!res.ok) throw new Error(body.error || STAMP_ADMIN_ADJUST_WRITE_FAIL);
  return body.data as T;
}

export function StampAdminAdjustSection({ sessionToken }: { sessionToken: string }) {
  const [searchVal, setSearchVal] = useState("");
  const [parentInfo, setParentInfo] = useState<ParentSearchResult | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [cardView, setCardView] = useState<StampAdminAdjustCardView | null>(null);
  const [setAmount, setSetAmount] = useState("");
  const [lookupMsg, setLookupMsg] = useState("");
  const [setMsg, setSetMsg] = useState("");
  const [amountError, setAmountError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [writeLoading, setWriteLoading] = useState(false);
  const [cardChecked, setCardChecked] = useState(false);
  const [confirmPending, setConfirmPending] = useState<{
    target: number;
    beforeCount: number;
    beforeStreak: number;
    studentName: string;
  } | null>(null);
  const [lastOp, setLastOp] = useState<{
    mobile: string;
    studentName: string;
    beforeCount: number;
    afterCount: number;
  } | null>(null);

  const loading = searchLoading || cardLoading || writeLoading;

  const resetSelectionFlow = () => {
    setSelectedStudentId(null);
    setCardView(null);
    setSetAmount("");
    setAmountError("");
    setSetMsg("");
    setConfirmPending(null);
    setCardChecked(false);
  };

  const loadCardForStudent = async (studentId: string) => {
    setCardLoading(true);
    setCardChecked(false);
    setSetMsg("");
    setAmountError("");
    setConfirmPending(null);
    setLastOp(null);
    try {
      const data = await stampAdjustAdminRequest<StampAdminAdjustCardView | null>(
        "stamp_student_adjust_card_get",
        sessionToken,
        { student_id: studentId }
      );
      setCardView(data);
      setCardChecked(true);
    } catch {
      setCardView(null);
      setSetMsg(STAMP_ADMIN_ADJUST_WRITE_FAIL);
    } finally {
      setCardLoading(false);
    }
  };

  const handleSearch = async () => {
    const mobile = searchVal.trim();
    if (!mobile) return;
    setSearchLoading(true);
    setLookupMsg("");
    setParentInfo(null);
    resetSelectionFlow();
    try {
      const data = await stampAdjustAdminRequest<ParentSearchResult | null>(
        "search_parent",
        sessionToken,
        { p_mobile: mobile }
      );
      if (!data) {
        setLookupMsg(STAMP_ADMIN_ADJUST_UNKNOWN_MOBILE);
        return;
      }
      setParentInfo(data);
    } catch {
      setLookupMsg(STAMP_ADMIN_ADJUST_SEARCH_FAIL);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectStudent = (studentId: string) => {
    if (loading) return;
    setSelectedStudentId(studentId);
    setSetAmount("");
    setAmountError("");
    setSetMsg("");
    setConfirmPending(null);
    setLastOp(null);
    setCardChecked(false);
    void loadCardForStudent(studentId);
  };

  const selectedStudentRow = parentInfo?.students.find(
    (row) => row.student.id === selectedStudentId
  );

  const displayStudentName =
    cardView?.student_name ??
    (selectedStudentRow
      ? formatStampAdminAdjustStudentLine({
          studentName: selectedStudentRow.student.student_name,
          gradeLevel: null,
        })
      : "");

  const validateTarget = (): number | null => {
    if (!selectedStudentId || !cardView) {
      setAmountError(STAMP_ADMIN_ADJUST_NEED_STUDENT);
      return null;
    }
    const target = parseAdminResumeTargetStampCount(setAmount, PRACTICE_STAMP_CARD_SIZE);
    if (target === null) {
      setAmountError(STAMP_ADMIN_ADJUST_AMOUNT_INVALID);
      return null;
    }
    setAmountError("");
    return target;
  };

  const requestConfirm = () => {
    setSetMsg("");
    const target = validateTarget();
    if (target === null || !cardView) return;
    setConfirmPending({
      target,
      beforeCount: cardView.stamp_count,
      beforeStreak: cardView.current_streak,
      studentName: displayStudentName,
    });
  };

  const handleWrite = async () => {
    if (!confirmPending || !selectedStudentId || !cardView) return;
    const { target, beforeCount, studentName } = confirmPending;
    setWriteLoading(true);
    setSetMsg("");
    try {
      const refreshed = await stampAdjustAdminRequest<StampAdminAdjustCardView>(
        "stamp_student_set_progress",
        sessionToken,
        {
          student_id: selectedStudentId,
          target_stamp_count: target,
        }
      );
      setCardView(refreshed);
      setSetAmount("");
      setConfirmPending(null);
      setSetMsg(
        formatStampAdminAdjustSuccessMessage({
          studentName,
          target,
          beforeCount,
        })
      );
      if (parentInfo) {
        setLastOp({
          mobile: parentInfo.parent.mobile_number,
          studentName,
          beforeCount,
          afterCount: target,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("蓋印數須為")) {
        setSetMsg(STAMP_ADMIN_ADJUST_CLAMP_REJECT);
      } else if (message) {
        setSetMsg(message);
      } else {
        setSetMsg(STAMP_ADMIN_ADJUST_WRITE_FAIL);
      }
    } finally {
      setWriteLoading(false);
    }
  };

  const students = parentInfo?.students ?? [];
  const showSetCard =
    Boolean(selectedStudentId) && !cardLoading && cardView !== null;
  const showNoActiveCard =
    Boolean(selectedStudentId) && cardChecked && !cardLoading && cardView === null && !setMsg;

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
      <h2 className="text-sm font-bold text-gray-800">{STAMP_ADMIN_ADJUST_SECTION_TITLE}</h2>
      <p className="text-xs text-gray-500">{STAMP_ADMIN_ADJUST_SECTION_HELPER}</p>

      <div className="flex gap-2">
        <input
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
          placeholder={STAMP_ADMIN_ADJUST_LOOKUP_PLACEHOLDER}
          className="flex-1 p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={loading || !searchVal.trim()}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {searchLoading ? STAMP_ADMIN_ADJUST_LOOKUP_LOADING : STAMP_ADMIN_ADJUST_LOOKUP_IDLE}
        </button>
      </div>

      {lookupMsg && <p className="text-sm text-red-500">{lookupMsg}</p>}

      {parentInfo && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {formatStampAdminAdjustParentLine({
              mobile: parentInfo.parent.mobile_number,
              parentName: parentInfo.parent.parent_name,
            })}
          </p>
          <p className="text-sm font-semibold text-gray-800">{STAMP_ADMIN_ADJUST_LIST_HEADING}</p>

          {students.length === 0 ? (
            <p className="text-sm text-red-500">{STAMP_ADMIN_ADJUST_NO_STUDENTS}</p>
          ) : (
            <div className="space-y-2">
              {students.map((row) => {
                const selected = row.student.id === selectedStudentId;
                return (
                  <button
                    key={row.student.id}
                    type="button"
                    onClick={() => handleSelectStudent(row.student.id)}
                    disabled={loading}
                    className={`w-full text-left rounded-lg border p-3 text-sm transition-colors disabled:opacity-50 ${
                      selected
                        ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200"
                        : "border-gray-100 bg-white hover:border-indigo-200"
                    }`}
                  >
                    {formatStampAdminAdjustStudentLine({
                      studentName: row.student.student_name,
                      gradeLevel: row.student.grade_level,
                    })}
                  </button>
                );
              })}
            </div>
          )}

          {cardLoading && selectedStudentId && (
            <p className="text-sm text-gray-400">載入印花卡…</p>
          )}

          {showNoActiveCard && (
            <p className="text-sm text-red-500">{STAMP_ADMIN_ADJUST_NO_ACTIVE_CARD}</p>
          )}

          {showSetCard && cardView && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <p className="text-sm text-gray-700">學生：{displayStudentName}</p>
              <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 text-sm space-y-1">
                <p className="text-sky-900">
                  {STAMP_ADMIN_ADJUST_COUNT_LABEL}： {cardView.stamp_count} / {PRACTICE_STAMP_CARD_SIZE}
                </p>
                <p className="text-sky-900">
                  {STAMP_ADMIN_ADJUST_STREAK_LABEL}： {cardView.current_streak} 日
                </p>
                <p className="text-sky-800 text-xs">
                  {STAMP_ADMIN_ADJUST_LAST_PREFIX}
                  {cardView.last_stamp_hkt_date
                    ? `${cardView.last_stamp_hkt_date}（香港時間）`
                    : STAMP_ADMIN_ADJUST_LAST_NONE}
                </p>
                <p className="text-sky-800 text-xs">
                  {STAMP_ADMIN_ADJUST_STATUS_PREFIX}
                  {cardView.card_status_label}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-700">{STAMP_ADMIN_ADJUST_AMOUNT_LABEL}</label>
                <input
                  value={setAmount}
                  onChange={(e) => {
                    setSetAmount(e.target.value.replace(/\D/g, ""));
                    setAmountError("");
                    setConfirmPending(null);
                  }}
                  placeholder={STAMP_ADMIN_ADJUST_AMOUNT_PLACEHOLDER}
                  disabled={loading || Boolean(confirmPending)}
                  className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 disabled:opacity-50"
                />
                <p className="text-xs text-gray-500">{STAMP_ADMIN_ADJUST_AMOUNT_HELPER}</p>
                {amountError && <p className="text-sm text-red-500">{amountError}</p>}
              </div>

              {!confirmPending && (
                <button
                  type="button"
                  onClick={requestConfirm}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {STAMP_ADMIN_ADJUST_PRIMARY_CTA}
                </button>
              )}

              {confirmPending && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-sm font-semibold text-amber-900">{STAMP_ADMIN_ADJUST_CONFIRM_TITLE}</p>
                  <p className="text-sm text-amber-900 whitespace-pre-wrap">
                    {formatStampAdminAdjustConfirmBody({
                      studentName: confirmPending.studentName,
                      target: confirmPending.target,
                      beforeCount: confirmPending.beforeCount,
                      beforeStreak: confirmPending.beforeStreak,
                    })}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleWrite()}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {STAMP_ADMIN_ADJUST_CONFIRM_CTA}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPending(null)}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                    >
                      {STAMP_ADMIN_ADJUST_CANCEL_CTA}
                    </button>
                  </div>
                </div>
              )}

              {setMsg && (
                <p
                  className={`text-sm ${
                    setMsg.startsWith("成功") ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {setMsg}
                </p>
              )}

              {lastOp && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-emerald-700">
                  {formatStampAdminAdjustLastOpDetail(lastOp)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
