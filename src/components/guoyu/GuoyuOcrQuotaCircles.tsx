import {
  formatGuoyuOcrQuotaLine,
  type GuoyuOcrQuotaView,
} from "@/lib/guoyu/quota-copy";
import { GuoyuParentQuotaCircles } from "@/components/guoyu/GuoyuParentQuotaCircles";

export type GuoyuOcrQuotaCirclesProps = {
  view: GuoyuOcrQuotaView;
  onUpgrade: () => void;
};

export function GuoyuOcrQuotaCircles({ view, onUpgrade }: GuoyuOcrQuotaCirclesProps) {
  return (
    <div className="mt-4">
      <GuoyuParentQuotaCircles
        view={view}
        ariaLabel={formatGuoyuOcrQuotaLine(view)}
        freeTierUpsellLabel="了解月費（享 10 次 OCR）"
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
