"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Question } from "@/lib/types";
import { OPTION_KEYS, OPTION_LABELS } from "@/lib/student-quiz-constants";
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

function StarProgress({ onQuestion, total }: { onQuestion: number; total: number }) {
  const n = Math.min(onQuestion, total);
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1.5"
      role="img"
      aria-label={`第 ${n} 題，共 ${total} 題`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`text-xl leading-none transition-all duration-300 sm:text-3xl ${
            i < n ? "scale-100 drop-shadow-sm" : "scale-90 opacity-35 grayscale"
          }`}
        >
          {i < n ? "⭐" : "○"}
        </span>
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
}: {
  label: string;
  text: string;
  optionStyle: { bg: string; ring: string };
  disabled: boolean;
  onPress: () => void;
  title?: string;
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
        rounded-2xl border-2 border-white/50 bg-gradient-to-br ${optionStyle.bg}
        px-3 py-3 text-left shadow-md transition-shadow sm:px-4 sm:py-3.5
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
  shortAnswer,
  hasImage,
  getImageUrl,
  textAnswer,
  onTextChange,
  submitting,
  onSubmit,
  canSubmit,
  isLastQuestion,
  onToggleSound,
  soundEnabled,
  encouragementIndex,
  transitionKey,
  onSelectOption,
  showSubmitButton,
}: {
  currentQuestion: Question;
  currentIndex: number;
  totalQuestions: number;
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
          <StarProgress onQuestion={currentIndex + 1} total={totalQuestions} />
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
                <h2
                  className="text-balance text-xl font-extrabold leading-relaxed text-slate-800 sm:text-2xl"
                  style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
                >
                  <QuestionContentParagraphs
                    content={currentQuestion.content}
                    className="text-balance text-xl font-extrabold leading-relaxed text-slate-800 sm:text-2xl"
                    paragraphGapClass="mt-3 sm:mt-4"
                    alignClass="text-center"
                  />
                </h2>
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
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {showSubmitButton && (
        <div className="sticky bottom-0 border-t border-white/30 bg-gradient-to-b from-amber-50/90 to-rose-50/95 px-3 pb-4 pt-2 backdrop-blur sm:px-4 sm:pb-5">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            className={`
            relative mx-auto block w-full max-w-2xl overflow-hidden rounded-2xl border-b-[6px] border-violet-700/30 py-4 text-center text-xl font-extrabold sm:text-2xl
            text-white shadow-[0_4px_0_#7c3aed] transition-all
            ${
              canSubmit && !submitting
                ? "bg-gradient-to-b from-fuchsia-400 via-violet-500 to-indigo-600 active:translate-y-1 active:border-b-2 active:shadow-sm"
                : "cursor-not-allowed border-b-0 bg-slate-300/90 text-slate-500 shadow-none"
            }
          `}
            style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
          >
            {submitting ? "提交中…" : isLastQuestion ? "提交並查看結果" : "提交答案"}
          </button>
        </div>
      )}
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
