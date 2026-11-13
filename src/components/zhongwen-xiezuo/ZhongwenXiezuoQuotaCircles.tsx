import { GuoyuParentQuotaCircles } from "@/components/guoyu/GuoyuParentQuotaCircles";
import {
  formatZhongwenXiezuoQuotaLine,
  ZHONGWEN_XIEZUO_QUOTA_EXPLAINER,
  type ZhongwenXiezuoQuotaView,
} from "@/lib/zhongwen-xiezuo/quota-copy";

export function ZhongwenXiezuoQuotaCircles({
  view,
  onUpgrade,
}: {
  view: ZhongwenXiezuoQuotaView;
  onUpgrade: () => void;
}) {
  return (
    <div className="mt-4">
      <GuoyuParentQuotaCircles
        view={view}
        ariaLabel={formatZhongwenXiezuoQuotaLine(view)}
        freeTierUpsellLabel="了解月費（享 10 次中文寫作）"
        onUpgrade={onUpgrade}
      />
      <p className="mt-2 text-xs text-gray-500">{ZHONGWEN_XIEZUO_QUOTA_EXPLAINER}</p>
    </div>
  );
}
