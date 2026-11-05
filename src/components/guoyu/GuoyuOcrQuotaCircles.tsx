import {
  formatGuoyuOcrQuotaLine,
  guoyuOcrQuotaCircleTotal,
  guoyuOcrQuotaCirclesUsed,
  type GuoyuOcrQuotaView,
} from "@/lib/guoyu/quota-copy";

export type GuoyuOcrQuotaCirclesProps = {
  view: GuoyuOcrQuotaView;
  onUpgrade: () => void;
};

export function GuoyuOcrQuotaCircles({ view, onUpgrade }: GuoyuOcrQuotaCirclesProps) {
  const total = guoyuOcrQuotaCircleTotal(view);
  const used = guoyuOcrQuotaCirclesUsed(view);
  const ariaLabel = formatGuoyuOcrQuotaLine(view);

  return (
    <div className="mt-4">
      <div
        className="flex flex-wrap items-center gap-2"
        role="img"
        aria-label={ariaLabel}
      >
        <span className="sr-only">{ariaLabel}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from({ length: total }, (_, i) => {
            const isUsed = i < used;
            return (
              <span
                key={i}
                aria-hidden
                className={`inline-block h-3.5 w-3.5 rounded-full ring-1 ${
                  isUsed
                    ? "bg-indigo-600 ring-indigo-700"
                    : "bg-gray-100 ring-gray-300"
                }`}
              />
            );
          })}
        </div>
        {!view.isPaidMit && (
          <button
            type="button"
            onClick={onUpgrade}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          >
            了解月費（享 10 次 OCR）
          </button>
        )}
      </div>
    </div>
  );
}
