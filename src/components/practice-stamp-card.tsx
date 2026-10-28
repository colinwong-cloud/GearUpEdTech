"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PRACTICE_STAMP_CARD_SIZE } from "@/lib/practice-stamp-card";
import {
  GROWTH_STAMP_COPY,
  STAMP_CARD_HEADER_TITLE,
  STAMP_FOOTER_COPY,
  STAMP_HOME_REOPEN_LABEL,
  clearPracticeStampCardHomeDismissForSession,
  formatStampGiftWindowEndLabel,
  isPracticeStampCardHomeDismissedForSession,
  loadStudentStampRedeemOffer,
  parseStudentStampCardStatus,
  practiceStampEarnFeedbackMessage,
  progressFooterLine,
  requestPracticeStampRedeem,
  resolvePracticeStampFooterState,
  setPracticeStampCardHomeDismissedForSession,
  stampCardHeaderStreakLine,
  stampSlotRotationDeg,
  type PracticeStampAwardPayload,
  type StudentStampCardStatus,
  type StudentStampRedeemOffer,
} from "@/lib/practice-stamp-card-ui";

export type PracticeStampCardProps = {
  studentId: string;
  variant?: "compact" | "full";
  dismissible?: boolean;
  earnFeedbackAward?: PracticeStampAwardPayload | null;
  giftWindowOpen?: boolean;
  giftInStock?: boolean;
  className?: string;
};

const DEFAULT_REDEEM_OFFER: StudentStampRedeemOffer = {
  gift_window_open: true,
  gift_in_stock: true,
  redeemable: false,
  gift_name: null,
  face_value_hkd: null,
  window_end_hkt: null,
};

export function PracticeStampCard({
  studentId,
  variant = "full",
  dismissible = false,
  earnFeedbackAward,
  giftWindowOpen: giftWindowOpenProp,
  giftInStock: giftInStockProp,
  className = "",
}: PracticeStampCardProps) {
  const [status, setStatus] = useState<StudentStampCardStatus | null>(null);
  const [redeemOffer, setRedeemOffer] = useState<StudentStampRedeemOffer>(DEFAULT_REDEEM_OFFER);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [redeemPhase, setRedeemPhase] = useState<
    "idle" | "confirm" | "redeeming" | "success" | "error"
  >("idle");
  const [postRedeem, setPostRedeem] = useState(false);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [animateTodayIndex, setAnimateTodayIndex] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data, error }, offer] = await Promise.all([
        supabase.rpc("get_student_stamp_card_status", {
          p_student_id: studentId,
        }),
        loadStudentStampRedeemOffer(studentId),
      ]);
      if (error) throw error;
      setStatus(parseStudentStampCardStatus(data));
      setRedeemOffer(offer);
    } catch {
      setStatus(null);
      setRedeemOffer(DEFAULT_REDEEM_OFFER);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(isPracticeStampCardHomeDismissedForSession());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!earnFeedbackAward?.awarded || !status) return;
    const idx = Math.max(0, (status.stamp_count || 1) - 1);
    setAnimateTodayIndex(idx);
    if (!reducedMotion) {
      const t = window.setTimeout(() => setAnimateTodayIndex(null), 900);
      return () => window.clearTimeout(t);
    }
    setAnimateTodayIndex(null);
  }, [earnFeedbackAward, status, reducedMotion]);

  useEffect(() => {
    if (earnFeedbackAward?.awarded) {
      void refreshStatus();
    }
  }, [earnFeedbackAward, refreshStatus]);

  const earnBanner = useMemo(
    () => practiceStampEarnFeedbackMessage(earnFeedbackAward),
    [earnFeedbackAward]
  );

  const giftWindowOpen = giftWindowOpenProp ?? redeemOffer.gift_window_open;
  const giftInStock = giftInStockProp ?? redeemOffer.gift_in_stock;

  const footerState = resolvePracticeStampFooterState({
    status,
    redeemUiPhase: redeemPhase,
    postRedeemMessage: postRedeem,
    giftWindowOpen,
    giftInStock,
  });

  const stampsPerCard = status?.stamps_per_card ?? PRACTICE_STAMP_CARD_SIZE;
  const streakDisplay = status?.streak ?? 0;
  const filledCount = status?.stamp_count ?? 0;

  const handleDismiss = () => {
    setPracticeStampCardHomeDismissedForSession();
    setDismissed(true);
  };

  const handleReopen = () => {
    clearPracticeStampCardHomeDismissForSession();
    setDismissed(false);
  };

  const handleEnrol = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.rpc("enrol_student_stamp_card", {
        p_student_id: studentId,
      });
      if (error) throw error;
      const row = data as { enrolled?: boolean; reason?: string };
      if (row?.enrolled === false && row.reason === "enrolment_closed") {
        await refreshStatus();
        return;
      }
      await refreshStatus();
    } catch {
      // keep UI stable
    } finally {
      setEnrolling(false);
    }
  };

  const handleRedeemSubmit = async () => {
    setRedeemPhase("redeeming");
    const result = await requestPracticeStampRedeem(studentId);
    if (result.ok && result.couponCode) {
      setCouponCode(result.couponCode);
      setRedeemPhase("success");
      setPostRedeem(true);
      await refreshStatus();
      return;
    }
    setRedeemPhase("error");
  };

  const confirmGiftName =
    redeemOffer.gift_name ?? "GearUp 練習獎賞禮券";
  const confirmFaceValue = redeemOffer.face_value_hkd ?? 0;
  const confirmWindowEnd = formatStampGiftWindowEndLabel(redeemOffer.window_end_hkt);

  if (dismissible && dismissed && variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleReopen}
        className={`mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/95 to-orange-50/90 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100/80 ${className}`}
        aria-expanded={false}
        aria-controls="practice-stamp-card-home-module"
      >
        {STAMP_HOME_REOPEN_LABEL}
      </button>
    );
  }

  const compact = variant === "compact";

  return (
    <section
      id={compact && dismissible ? "practice-stamp-card-home-module" : undefined}
      className={`rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/95 to-orange-50/90 shadow-sm ${compact ? "p-3" : "p-4 sm:p-5"} ${className}`}
      aria-label={STAMP_CARD_HEADER_TITLE}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className={`font-bold text-amber-950 ${compact ? "text-base" : "text-lg"}`}>
            {STAMP_CARD_HEADER_TITLE}
          </h2>
          <p className="mt-0.5 text-sm font-semibold text-amber-900/90">
            {stampCardHeaderStreakLine(streakDisplay)}
          </p>
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-amber-800/80 hover:bg-amber-100/80"
            aria-label="收起印花卡"
          >
            收起
          </button>
        )}
      </div>

      {earnBanner && !compact && (
        <p className="mt-3 rounded-xl border border-amber-300/60 bg-white/80 px-3 py-2 text-sm font-medium text-amber-950">
          {earnBanner}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-amber-900/70">載入印花卡…</p>
      ) : (
        <>
          <div
            className={`mt-3 grid grid-cols-5 ${compact ? "gap-1.5" : "gap-2 sm:gap-2.5"}`}
            role="list"
            aria-label={`印花格 ${filledCount} / ${stampsPerCard}`}
          >
            {Array.from({ length: stampsPerCard }, (_, index) => {
              const stamped = index < filledCount;
              const isTodayPop = animateTodayIndex === index && stamped;
              const rot = stampSlotRotationDeg(index);
              return (
                <div
                  key={index}
                  role="listitem"
                  className={`relative aspect-square ${isTodayPop && !reducedMotion ? "animate-stamp-pop" : ""}`}
                >
                  {stamped ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/stamps/stamp-seal.svg"
                      alt=""
                      className="h-full w-full object-contain drop-shadow-sm"
                      style={{ transform: `rotate(${rot}deg)` }}
                      draggable={false}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/stamps/stamp-slot-empty.svg"
                      alt=""
                      className="h-full w-full object-contain opacity-80"
                      draggable={false}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-2 text-sm text-amber-950/90">
            {footerState === "progress" && status && (
              <p>{progressFooterLine(status)}</p>
            )}
            {footerState === "redeemable" && (
              <>
                <p>{GROWTH_STAMP_COPY.completedNotRedeemed}</p>
                <p className="text-xs text-amber-900/80">{GROWTH_STAMP_COPY.redeemableHint}</p>
                <button
                  type="button"
                  onClick={() => setRedeemPhase("confirm")}
                  className="mt-1 w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  {STAMP_FOOTER_COPY.redeemCta}
                </button>
              </>
            )}
            {footerState === "not_enrolled_open" && (
              <>
                <p>{GROWTH_STAMP_COPY.blank}</p>
                <button
                  type="button"
                  disabled={enrolling}
                  onClick={() => void handleEnrol()}
                  className="mt-1 w-full rounded-xl border border-amber-400 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-60"
                >
                  {enrolling ? "處理中…" : STAMP_FOOTER_COPY.enrolCta}
                </button>
              </>
            )}
            {footerState === "not_enrolled_off" && (
              <p>{STAMP_FOOTER_COPY.programClosedForNew}</p>
            )}
            {footerState === "program_closed_for_new" && (
              <p>{STAMP_FOOTER_COPY.programClosedForNew}</p>
            )}
            {footerState === "window_closed" && <p>{STAMP_FOOTER_COPY.windowClosed}</p>}
            {footerState === "out_of_stock" && <p>{STAMP_FOOTER_COPY.outOfStock}</p>}
            {footerState === "redeeming" && <p>{STAMP_FOOTER_COPY.redeeming}</p>}
            {footerState === "error" && <p>{STAMP_FOOTER_COPY.redeemError}</p>}
            {footerState === "post_redeem" && (
              <p>{GROWTH_STAMP_COPY.afterRedeemNewCycle}</p>
            )}
            {footerState === "success" && (
              <div className="space-y-2 rounded-xl border border-emerald-200 bg-white/90 p-3">
                <p className="text-sm leading-relaxed">{GROWTH_STAMP_COPY.redeemSuccessAck}</p>
                {couponCode && (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-lg bg-gray-100 px-2 py-1 font-mono text-sm">{couponCode}</code>
                    <button
                      type="button"
                      className="text-xs font-semibold text-amber-800 underline"
                      onClick={() => void navigator.clipboard?.writeText(couponCode)}
                    >
                      複製兌換碼
                    </button>
                  </div>
                )}
                <p className="text-xs text-amber-900/85">{STAMP_FOOTER_COPY.postRedeemTomorrow}</p>
              </div>
            )}
          </div>
        </>
      )}

      {redeemPhase === "confirm" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stamp-redeem-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h3 id="stamp-redeem-title" className="text-lg font-bold text-gray-900">
              確認換領
            </h3>
            <dl className="mt-3 space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">禮品</dt>
                <dd className="font-medium text-right">{confirmGiftName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">面值</dt>
                <dd className="font-medium">HK${confirmFaceValue}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">換領期至</dt>
                <dd className="font-medium">{confirmWindowEnd}</dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700"
                onClick={() => setRedeemPhase("idle")}
              >
                取消
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
                onClick={() => void handleRedeemSubmit()}
              >
                {STAMP_FOOTER_COPY.redeemCta}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function clearPracticeStampCardDismissForSession() {
  clearPracticeStampCardHomeDismissForSession();
}
