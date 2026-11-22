"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Question } from "@/lib/types";
import { OPTION_KEYS, OPTION_LABELS } from "@/lib/student-quiz-constants";
import {
  PRACTICE_FINISH_DISABLED_REASON,
  PRACTICE_NAV_FINISH_LABEL,
  PRACTICE_NAV_NEXT_LABEL,
  PRACTICE_NAV_PREV_LABEL,
  buildQuestionProgressMarkers,
  countSessionAnswers,
  type PracticeProgressMarkerVisual,
} from "@/lib/student-practice-ux";
import { QuestionContentParagraphs } from "@/components/question-content-paragraphs";

const OPTION_STYLES: Record<string, { bg: string; ring: string }> = {
  A: { bg: "from-sky-200/90 to-blue-200/80", ring: "ring-sky-400/80" },
  B: { bg: "from-pink-200/90 to-rose-200/80", ring: "ring-pink-400/80" },
  C: { bg: "from-amber-200/90 to-yellow-200/80", ring: "ring-amber-400/80" },
  D: { bg: "from-emerald-200/90 to-green-200/80", ring: "ring-emerald-500/80" },
};

const ENCOURAGE = [
  { text: "You're doing great! 🌟", sub: "繼續加油！" },
  { text: "Keep it up! 💪", sub: "你很棒！" },
  { text: "Nice work! ⭐", sub: "專心作答！" },
] as const;

const SOUND_KEY = "gearup-quiz-sound-enabled";
const STAR_PROGRESS_POLICY_VERSION = "quiz-star-per-question-v3";
const STAR_PROGRESS_COLUMNS = 10;

function logAntiMissingStarProgress(event: string, payload: Record<string, unknown>) {
  console.info(
    `[anti-missing][quiz][star-progress] ${event} ${JSON.stringify({
      policy_version: STAR_PROGRESS_POLICY_VERSION,
      ...payload,
    })}`
  );
}

function playClickSound() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    o.start();
    o.stop(ctx.currentTime + 0.09);
  } catch {
    // ignore
  }
}

function StarProgressMarker({ visual }: { visual: PracticeProgressMarkerVisual }) {
  const isCurrent = visual.startsWith("current-");
  const isDot = visual === "unvisited-dot";
  const isGrey =
    visual === "skipped-grey-star" || visual === "current-skipped-grey-star";
  const showStar = !isDot;

  const glyph = showStar ? "⭐" : "○";

  return (
    <span
      className={`relative inline-flex h-8 w-8 items-center justify-center text-xl leading-none transition-all duration-300 sm:h-10 sm:w-10 sm:text-3xl ${
        isDot ? "text-slate-400" : isGrey ? "text-slate-400 grayscale opacity-80" : "drop-shadow-sm"
      }`}
    >
      <span aria-hidden>{glyph}</span>
      {isCurrent ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-indigo-500/90 ring-2 ring-indigo-300/50"
        />
      ) : null}
    </span>
  );
}

function StarProgress({
  currentIndex,
  total,
  visited,
  skipped,
  choicesByIndex,
}: {
  currentIndex: number;
  total: number;
  visited: Record<number, boolean>;
  skipped: Record<number, boolean>;
  choicesByIndex: Record<number, string | undefined>;
}) {
  const safeTotal = Math.max(0, Math.trunc(total));
  const markers = buildQuestionProgressMarkers(
    safeTotal,
    currentIndex,
    visited,
    skipped,
    choicesByIndex
  );
  const answered = countSessionAnswers(choicesByIndex, safeTotal);

  useEffect(() => {
    logAntiMissingStarProgress("layout-applied", {
      answered_count: answered,
      total: safeTotal,
      current_index: currentIndex,
      columns: STAR_PROGRESS_COLUMNS,
      marker_rule: "per-question-visited-answered-skipped-current-ring",
      marker_sample: markers.slice(0, Math.min(10, markers.length)),
    });
  }, [answered, currentIndex, markers, safeTotal]);

  return (
    <div
      className="mx-auto grid w-full max-w-xl justify-items-center gap-x-1.5 gap-y-1.5"
      style={{ gridTemplateColumns: `repeat(${STAR_PROGRESS_COLUMNS}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`已完成 ${answered} 題，共 ${safeTotal} 題`}
      data-star-progress-policy={STAR_PROGRESS_POLICY_VERSION}
      data-star-progress-interactive="false"
    >
      {markers.map((visual, i) => (
        <StarProgressMarker key={i} visual={visual} />
      ))}
    </div>
  );
}

function OptionButton({
  label,
  text,
  optionStyle,
  disabled,
  onPress,
  title,
  selected,
}: {
  label: string;
  text: string;
  optionStyle: { bg: string; ring: string };
  disabled: boolean;
  onPress: () => void;
  title?: string;
  selected?: boolean;
}) {
  return (
    <motion.button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onPress}
      whileHover={disabled ? undefined : { scale: 1.04, y: -2, boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.2)" }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      className={`
        group relative flex w-full min-w-0 items-start justify-start gap-3
        rounded-2xl bg-gradient-to-br ${optionStyle.bg}
        px-3 py-3 text-left shadow-md transition-shadow sm:px-4 sm:py-3.5
        ${
          selected
            ? "border-[3px] border-indigo-600 ring-2 ring-indigo-400/90"
            : "border-2 border-white/50"
        }
        ${disabled ? "cursor-not-allowed opacity-60" : "hover:shadow-xl cursor-pointer"}
      `}
      style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/60 bg-white/35 text-base font-extrabold text-slate-800 shadow-sm sm:h-12 sm:w-12 sm:text-lg"
        aria-hidden
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 whitespace-normal break-words text-left text-base font-semibold leading-snug text-slate-800 sm:text-lg sm:leading-snug">
        {text}
      </span>
    </motion.button>
  );
}

export function StudentQuizExperience({
  currentQuestion,
  currentIndex,
  totalQuestions,
  practiceVisited,
  practiceSkipped,
  sessionChoicesByIndex,
  shortAnswer,
  hasImage,
  getImageUrl,
  textAnswer,
  onTextChange,
  submitting,
  onSubmit,
  canSubmit,
  isLastQuestion: _isLastQuestion,
  onToggleSound,
  soundEnabled,
  encouragementIndex,
  transitionKey,
  onSelectOption,
  showSubmitButton,
  submitNotice,
  onClearSubmitNotice,
  selectedMcqOption,
  onPrevQuestion,
  onNextQuestion,
  onFinishPractice,
  canGoPrev,
  canGoNext,
  showFinishAction,
  canFinishPractice,
}: {
  currentQuestion: Question;
  currentIndex: number;
  totalQuestions: number;
  practiceVisited: Record<number, boolean>;
  practiceSkipped: Record<number, boolean>;
  sessionChoicesByIndex: Record<number, string | undefined>;
  shortAnswer: boolean;
  hasImage: (q: Question) => boolean;
  getImageUrl: (q: Question) => string | null;
  textAnswer: string;
  onTextChange: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  canSubmit: boolean;
  isLastQuestion: boolean;
  onToggleSound: () => void;
  soundEnabled: boolean;
  encouragementIndex: number;
  transitionKey: number;
  onSelectOption: (label: string) => void;
  showSubmitButton: boolean;
  submitNotice?: string | null;
  onClearSubmitNotice?: () => void;
  selectedMcqOption?: string | null;
  onPrevQuestion: () => void;
  onNextQuestion: () => void;
  onFinishPractice: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  showFinishAction: boolean;
  canFinishPractice: boolean;
}) {
  const img = hasImage(currentQuestion) ? getImageUrl(currentQuestion) : null;
  const e = ENCOURAGE[encouragementIndex % ENCOURAGE.length]!;

  return (
    <div
      className="flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col"
      style={{
        background:
          "linear-gradient(150deg, #ffecf2 0%, #fef3c7 18%, #dbeafe 40%, #f3e8ff 62%, #d1fae5 100%)",
      }}
    >

      <div className="mb-1 flex items-start justify-between gap-2 px-3 pt-2 sm:px-4">
        <p
          className="text-base font-medium text-rose-600/90 sm:text-lg"
          style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
        >
          <span className="text-violet-800">{e.sub} </span>
          <span className="font-semibold">{e.text}</span>
        </p>
        <button
          type="button"
          onClick={onToggleSound}
          className="shrink-0 rounded-full border-2 border-white/70 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-600 shadow-sm backdrop-blur sm:text-base"
        >
          音效 {soundEnabled ? "ON" : "OFF"}
        </button>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 px-3 pb-6 sm:px-4 sm:pb-8">
        <div className="mb-2">
          <StarProgress
            currentIndex={currentIndex}
            total={totalQuestions}
            visited={practiceVisited}
            skipped={practiceSkipped}
            choicesByIndex={sessionChoicesByIndex}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={transitionKey}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ duration: 0.32, ease: "easeInOut" }}
            className="w-full"
          >
            <div className="min-w-0 flex-1">
              <div
                className="relative rounded-[1.6rem] border-4 border-white/95 bg-gradient-to-br from-fuchsia-50/98 via-white to-amber-50/95 px-4 py-5 text-center shadow-[0_10px_0_#e9d5ff] sm:px-5 sm:py-6"
                style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
              >
                <div
                  role="heading"
                  aria-level={2}
                  className="text-balance text-xl font-extrabold leading-relaxed text-slate-800 sm:text-2xl"
                  style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
                >
                  <QuestionContentParagraphs
                    content={currentQuestion.content}
                    className="text-balance text-xl font-extrabold leading-relaxed text-slate-800 sm:text-2xl"
                    paragraphGapClass="mt-3 sm:mt-4"
                    alignClass="text-center"
                  />
                </div>
              </div>
            </div>

            {img && (
              <div className="mt-4 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt=""
                  className="max-h-48 w-auto max-w-full rounded-2xl border-4 border-white/80 object-contain shadow-lg sm:max-h-56"
                  draggable={false}
                />
              </div>
            )}

            <div className="mt-4 space-y-3 sm:mt-5">
              {shortAnswer ? (
                <label className="block" style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}>
                  <span className="mb-2 block text-base font-bold text-slate-600 sm:text-lg">在這裡寫上你的答案</span>
                  <input
                    type="text"
                    value={textAnswer}
                    onChange={(e) => onTextChange(e.target.value)}
                    disabled={submitting}
                    className={`w-full rounded-2xl border-4 p-4 text-lg font-semibold shadow-inner outline-none transition-all sm:text-xl ${
                      textAnswer.trim()
                        ? "border-fuchsia-300 bg-white/80"
                        : "border-white/80 bg-white/50"
                    } ${submitting ? "opacity-60" : ""}`}
                  />
                </label>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {OPTION_LABELS.map((label, i) => {
                    const text = currentQuestion[OPTION_KEYS[i]!];
                    if (text == null) return null;
                    const st = OPTION_STYLES[label] ?? OPTION_STYLES.A;
                    const t = String(text);
                    return (
                      <OptionButton
                        key={`${label}-${transitionKey}`}
                        label={label}
                        text={t}
                        optionStyle={st}
                        disabled={submitting}
                        onPress={() => onSelectOption(label)}
                        title={t}
                        selected={selectedMcqOption === label}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {submitNotice && (
          <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/95 px-3 py-2 text-sm text-amber-800 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="leading-relaxed">{submitNotice}</p>
              <button
                type="button"
                onClick={onClearSubmitNotice}
                className="shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                關閉
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-white/30 bg-gradient-to-b from-amber-50/90 to-rose-50/95 px-3 pb-4 pt-2 backdrop-blur sm:px-4 sm:pb-5">
        {showSubmitButton && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            className={`
            relative mx-auto mb-3 block w-full max-w-2xl overflow-hidden rounded-2xl border-b-[6px] border-violet-700/30 py-3 text-center text-lg font-extrabold sm:text-xl
            text-white shadow-[0_4px_0_#7c3aed] transition-all
            ${
              canSubmit && !submitting
                ? "bg-gradient-to-b from-fuchsia-400 via-violet-500 to-indigo-600 active:translate-y-1 active:border-b-2 active:shadow-sm"
                : "cursor-not-allowed border-b-0 bg-slate-300/90 text-slate-500 shadow-none"
            }
          `}
            style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
          >
            {submitting ? "提交中…" : "儲存此題答案"}
          </button>
        )}
        <div className="mx-auto flex w-full max-w-2xl items-stretch gap-3">
          <button
            type="button"
            onClick={onPrevQuestion}
            disabled={!canGoPrev || submitting}
            className={`flex-1 rounded-2xl border-2 px-3 py-3.5 text-center text-base font-bold sm:text-lg ${
              canGoPrev && !submitting
                ? "border-indigo-300 bg-white/90 text-indigo-800 shadow-sm active:scale-[0.98]"
                : "cursor-not-allowed border-gray-200 bg-gray-100/80 text-gray-400"
            }`}
            style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
          >
            {PRACTICE_NAV_PREV_LABEL}
          </button>
          {showFinishAction ? (
            <div className="flex flex-[1.4] flex-col gap-1">
              <button
                type="button"
                onClick={onFinishPractice}
                disabled={!canFinishPractice || submitting}
                className={`w-full rounded-2xl border-b-[5px] px-3 py-3.5 text-center text-base font-extrabold sm:text-lg ${
                  canFinishPractice && !submitting
                    ? "border-violet-700/30 bg-gradient-to-b from-fuchsia-400 via-violet-500 to-indigo-600 text-white shadow-[0_3px_0_#7c3aed] active:translate-y-0.5"
                    : "cursor-not-allowed border-b-0 bg-slate-300/90 text-slate-500"
                }`}
                style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
              >
                {submitting ? "提交中…" : PRACTICE_NAV_FINISH_LABEL}
              </button>
              {!canFinishPractice && !submitting && (
                <p className="text-center text-xs font-medium text-slate-500">
                  {PRACTICE_FINISH_DISABLED_REASON}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onNextQuestion}
              disabled={!canGoNext || submitting}
              className={`flex-1 rounded-2xl border-2 px-3 py-3.5 text-center text-base font-bold sm:text-lg ${
                canGoNext && !submitting
                  ? "border-indigo-500 bg-indigo-600 text-white shadow-sm active:scale-[0.98]"
                  : "cursor-not-allowed border-gray-200 bg-gray-100/80 text-gray-400"
              }`}
              style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
            >
              {PRACTICE_NAV_NEXT_LABEL}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function getQuizSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SOUND_KEY) !== "0";
}

export function setQuizSoundEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_KEY, on ? "1" : "0");
}

export { playClickSound, SOUND_KEY };
