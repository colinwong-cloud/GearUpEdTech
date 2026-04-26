"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Question } from "@/lib/types";
import { OPTION_KEYS, OPTION_LABELS } from "@/lib/student-quiz-constants";

function mascotImageSrc(): string {
  const override = process.env.NEXT_PUBLIC_MASCOT_IMAGE_URL?.trim();
  if (override) return override;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/Webpage_images/logo/logo_banana_student.png`;
}

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

function ConfettiBurst({ show }: { show: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 220,
        y: -30 - Math.random() * 100,
        r: 4 + Math.random() * 7,
        color: ["#fbbf24", "#f472b6", "#60a5fa", "#4ade80", "#c084fc", "#fb923c"][
          Math.floor(Math.random() * 6)
        ]!,
        rot: (Math.random() - 0.5) * 360,
        delay: Math.random() * 0.2,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show]
  );
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center overflow-hidden">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ opacity: 0, y: 0, x: 0, rotate: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            y: [0, p.y, p.y * 1.2],
            x: [0, p.x, p.x * 1.1],
            rotate: p.rot,
            scale: [0, 1.2, 0.8],
          }}
          transition={{ duration: 1, delay: p.delay, ease: "easeOut" }}
          className="absolute rounded-sm"
          style={{
            width: p.r,
            height: p.r * 0.6,
            background: p.color,
            bottom: "40%",
            left: "50%",
            marginLeft: -p.r / 2,
          }}
        />
      ))}
    </div>
  );
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
          className={`text-lg leading-none transition-all duration-300 sm:text-2xl ${
            i < n ? "scale-100 drop-shadow-sm" : "scale-90 opacity-35 grayscale"
          }`}
        >
          {i < n ? "⭐" : "○"}
        </span>
      ))}
    </div>
  );
}

function MascotBounceImage({ bounceKey }: { bounceKey: number }) {
  return (
    <div className="w-20 shrink-0 self-center sm:w-28 sm:self-start">
      <motion.div
        key={bounceKey}
        initial={{ y: 0 }}
        animate={{ y: [0, -12, 0, -8, 0] }}
        transition={{ duration: 0.55, times: [0, 0.2, 0.45, 0.65, 1] }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mascotImageSrc()}
          alt=""
          className="h-auto w-full drop-shadow-lg"
          width={120}
          height={120}
          draggable={false}
        />
      </motion.div>
    </div>
  );
}

function OptionButton({
  label,
  text,
  optionStyle,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  text: string;
  optionStyle: { bg: string; ring: string };
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onPress}
      whileHover={disabled ? undefined : { scale: 1.04, y: -2, boxShadow: "0 12px 24px -8px rgb(0 0 0 / 0.2)" }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      className={`
        group relative w-full overflow-hidden rounded-2xl border-2 border-white/50 bg-gradient-to-br ${optionStyle.bg}
        px-4 py-4 text-left shadow-md transition-shadow
        ${selected ? `ring-4 ${optionStyle.ring} ring-offset-2 ring-offset-amber-50/50` : "hover:shadow-xl"}
        ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}
      `}
      style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
    >
      <span
        className="mb-1.5 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/60 bg-white/35 text-base font-extrabold text-slate-800 shadow-sm"
        aria-hidden
      >
        {label}
      </span>
      <span className="text-base font-semibold leading-snug text-slate-800">{text}</span>
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
  selectedAnswer,
  textAnswer,
  onTextChange,
  submitting,
  onSubmit,
  canSubmit,
  isLastQuestion,
  afterFeedback,
  onToggleSound,
  soundEnabled,
  encouragementIndex,
  mascotBounceKey,
  transitionKey,
  onOptionPick,
  showConfetti,
}: {
  currentQuestion: Question;
  currentIndex: number;
  totalQuestions: number;
  shortAnswer: boolean;
  hasImage: (q: Question) => boolean;
  getImageUrl: (q: Question) => string | null;
  selectedAnswer: string | null;
  textAnswer: string;
  onTextChange: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  canSubmit: boolean;
  isLastQuestion: boolean;
  afterFeedback: "correct" | "wrong" | "idle" | "pending";
  onToggleSound: () => void;
  soundEnabled: boolean;
  encouragementIndex: number;
  mascotBounceKey: number;
  transitionKey: number;
  onOptionPick: (label: string) => void;
  showConfetti: boolean;
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
      <ConfettiBurst show={showConfetti} />

      <div className="mb-1 flex items-start justify-between gap-2 px-3 pt-2 sm:px-4">
        <p
          className="text-xs font-medium text-rose-600/90 sm:text-sm"
          style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
        >
          <span className="text-violet-800">{e.sub} </span>
          <span className="font-semibold">{e.text}</span>
        </p>
        <button
          type="button"
          onClick={onToggleSound}
          className="shrink-0 rounded-full border-2 border-white/70 bg-white/55 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm backdrop-blur"
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
            <div className="flex flex-col items-stretch sm:flex-row sm:items-start sm:gap-2">
              <MascotBounceImage bounceKey={mascotBounceKey} />
              <div className="min-w-0 flex-1 sm:pt-1">
                <div
                  className="relative rounded-[1.6rem] border-4 border-white/95 bg-gradient-to-br from-fuchsia-50/98 via-white to-amber-50/95 px-4 py-5 text-center shadow-[0_10px_0_#e9d5ff] sm:px-5 sm:py-6"
                  style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
                >
                  <div
                    className="absolute -left-0 top-3 hidden h-7 w-7 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-pink-100/90 bg-fuchsia-50/95 sm:block"
                    aria-hidden
                  />
                  <h2 className="text-balance text-base font-extrabold leading-relaxed text-slate-800 sm:text-lg">
                    {currentQuestion.content}
                  </h2>
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
                  <span className="mb-2 block text-sm font-bold text-slate-600">在這裡寫上你的答案</span>
                  <input
                    type="text"
                    value={textAnswer}
                    onChange={(e) => onTextChange(e.target.value)}
                    disabled={submitting || afterFeedback === "correct" || afterFeedback === "wrong" || afterFeedback === "pending"}
                    className={`w-full rounded-2xl border-4 p-4 text-base font-semibold shadow-inner outline-none transition-all ${
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
                    return (
                      <OptionButton
                        key={`${label}-${transitionKey}`}
                        label={label}
                        text={String(text)}
                        optionStyle={st}
                        selected={selectedAnswer === label}
                        disabled={submitting || afterFeedback === "correct" || afterFeedback === "wrong" || afterFeedback === "pending"}
                        onPress={() => onOptionPick(label)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {afterFeedback !== "idle" && !submitting && (
        <div
          className="border-t border-white/40 bg-white/25 px-4 py-2 text-center backdrop-blur"
          style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
        >
          {afterFeedback === "correct" && (
            <p className="text-base font-extrabold text-emerald-600">太棒了，答對了！🎉</p>
          )}
          {afterFeedback === "wrong" && <p className="text-base font-extrabold text-amber-800">再想想看！💡</p>}
        </div>
      )}

      <div className="sticky bottom-0 border-t border-white/30 bg-gradient-to-b from-amber-50/90 to-rose-50/95 px-3 pb-4 pt-2 backdrop-blur sm:px-4 sm:pb-5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className={`
            relative mx-auto block w-full max-w-2xl overflow-hidden rounded-2xl border-b-[6px] border-violet-700/30 py-4 text-center text-lg font-extrabold
            text-white shadow-[0_4px_0_#7c3aed] transition-all
            ${
              canSubmit && !submitting
                ? "bg-gradient-to-b from-fuchsia-400 via-violet-500 to-indigo-600 active:translate-y-1 active:border-b-2 active:shadow-sm"
                : "cursor-not-allowed border-b-0 bg-slate-300/90 text-slate-500 shadow-none"
            }
          `}
          style={{ fontFamily: "var(--font-baloo2), system-ui, sans-serif" }}
        >
          {(() => {
            if (afterFeedback === "pending" && submitting) return "提交中…";
            if (afterFeedback === "correct" || afterFeedback === "wrong")
              return isLastQuestion ? "看結果" : "下一題";
            return isLastQuestion ? "提交並查看結果" : "提交答案";
          })()}
        </button>
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
