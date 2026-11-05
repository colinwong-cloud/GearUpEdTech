import {
  GUOYU_QUOTA_CIRCLE_EXPLAINER,
  guoyuQuotaCircleTotal,
  guoyuQuotaCirclesUsed,
  type GuoyuParentQuotaView,
} from "@/lib/guoyu/quota-copy";
import { GuoyuQuotaTickCircle } from "@/components/guoyu/GuoyuQuotaTickCircle";

export type GuoyuParentQuotaCirclesProps = {
  view: GuoyuParentQuotaView;
  ariaLabel: string;
  freeTierUpsellLabel: string;
  onUpgrade?: () => void;
};

export function GuoyuParentQuotaCircles({
  view,
  ariaLabel,
  freeTierUpsellLabel,
  onUpgrade,
}: GuoyuParentQuotaCirclesProps) {
  const total = guoyuQuotaCircleTotal(view);
  const used = guoyuQuotaCirclesUsed(view);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="img" aria-label={ariaLabel}>
        <span className="sr-only">{ariaLabel}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <GuoyuQuotaTickCircle key={i} used={i < used} />
          ))}
        </div>
        {!view.isPaidMit && onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          >
            {freeTierUpsellLabel}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{GUOYU_QUOTA_CIRCLE_EXPLAINER}</p>
    </div>
  );
}
