import {
  formatGuoyuTtsQuotaLine,
  type GuoyuTtsQuotaView,
} from "@/lib/guoyu/quota-copy";
import { GuoyuParentQuotaCircles } from "@/components/guoyu/GuoyuParentQuotaCircles";

export type GuoyuTtsQuotaCirclesProps = {
  view: GuoyuTtsQuotaView;
  onUpgrade: () => void;
};

export function GuoyuTtsQuotaCircles({ view, onUpgrade }: GuoyuTtsQuotaCirclesProps) {
  return (
    <div className="mt-3">
      <GuoyuParentQuotaCircles
        view={view}
        ariaLabel={formatGuoyuTtsQuotaLine(view)}
        freeTierUpsellLabel="了解月費（享 10 次朗讀）"
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
