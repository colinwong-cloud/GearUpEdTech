import type { ZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";

export const ZHONGWEN_XIEZUO_RESULT_KEY = "gearup_zhongwen_xiezuo_result_v1";

export type ZhongwenXiezuoResultPayload = {
  sourceText: string;
  content: ZhongwenXiezuoGeneratedContent;
};

export function saveZhongwenXiezuoResult(payload: ZhongwenXiezuoResultPayload): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(ZHONGWEN_XIEZUO_RESULT_KEY, JSON.stringify(payload));
}

export function readZhongwenXiezuoResult(): ZhongwenXiezuoResultPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(ZHONGWEN_XIEZUO_RESULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ZhongwenXiezuoResultPayload;
  } catch {
    return null;
  }
}
