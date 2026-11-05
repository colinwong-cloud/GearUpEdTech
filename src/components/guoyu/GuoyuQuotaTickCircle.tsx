/** Shared green tick-in-circle glyph for guoyu OCR/TTS monthly quota rows. */

export type GuoyuQuotaTickCircleProps = {
  used: boolean;
  className?: string;
};

export function GuoyuQuotaTickCircle({ used, className = "h-4 w-4" }: GuoyuQuotaTickCircleProps) {
  if (used) {
    return (
      <svg viewBox="0 0 20 20" className={className} aria-hidden>
        <circle cx="10" cy="10" r="9" fill="#84cc16" stroke="#000000" strokeWidth="1.5" />
        <path
          d="M6 10.5 L9 13.5 L14 7"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <circle cx="10" cy="10" r="9" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1.5" />
    </svg>
  );
}
