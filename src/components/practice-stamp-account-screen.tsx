"use client";

import { useState } from "react";
import { PracticeStampCard } from "@/components/practice-stamp-card";
import { PracticeStampRedeemHistory } from "@/components/practice-stamp-redeem-history";
import { STAMP_ACCOUNT_PROGRESS_SECTION_TITLE } from "@/lib/practice-stamp-card-ui";
import { usePracticeStampCardChromeVisible } from "@/lib/use-practice-stamp-card-chrome";

export type PracticeStampAccountScreenProps = {
  studentId: string;
  studentName?: string;
  students?: { id: string; student_name: string }[];
  onSelectStudent?: (id: string) => void;
  onBack: () => void;
};

export function PracticeStampAccountScreen({
  studentId,
  studentName,
  students,
  onSelectStudent,
  onBack,
}: PracticeStampAccountScreenProps) {
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const { visible: stampChromeVisible, loading: stampChromeLoading } =
    usePracticeStampCardChromeVisible(studentId);
  const showStudentPicker =
    students && students.length > 1 && typeof onSelectStudent === "function";

  return (
    <div
      className="min-h-screen overflow-x-hidden bg-white/60 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur">
        <span className="text-sm font-medium text-gray-700">練習印花卡</span>
      </div>
      <div
        className="mx-auto max-w-lg space-y-8 px-4 py-6 pb-28"
        style={{ paddingBottom: "max(7rem, calc(1.5rem + env(safe-area-inset-bottom)))" }}
      >
        {showStudentPicker ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <label htmlFor="stamp-account-student" className="mb-2 block text-xs font-semibold text-gray-500">
              學生
            </label>
            <select
              id="stamp-account-student"
              value={studentId}
              onChange={(e) => onSelectStudent(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.student_name}
                </option>
              ))}
            </select>
          </div>
        ) : studentName ? (
          <p className="text-sm text-gray-500">
            學生：<span className="font-medium text-gray-800">{studentName}</span>
          </p>
        ) : null}

        {!stampChromeLoading && stampChromeVisible && (
          <>
            <section aria-labelledby="stamp-progress-heading" className="space-y-3">
              <h2 id="stamp-progress-heading" className="text-base font-bold text-gray-900">
                {STAMP_ACCOUNT_PROGRESS_SECTION_TITLE}
              </h2>
              <PracticeStampCard
                studentId={studentId}
                variant="full"
                accountChrome
                onRedeemSuccess={() => setHistoryRefreshToken((t) => t + 1)}
              />
            </section>

            <PracticeStampRedeemHistory studentId={studentId} refreshToken={historyRefreshToken} />
          </>
        )}

        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-8 py-3.5 font-semibold text-sky-700 transition-all duration-200 hover:bg-sky-50"
        >
          返回
        </button>
      </div>
    </div>
  );
}
