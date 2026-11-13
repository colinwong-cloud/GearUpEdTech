/** Owner-locked 修辭手法 list (Traditional Chinese — 誇張 U+8A87 U+5F35, not 夸張). */
export const ZHONGWEN_XIEZUO_RHETORIC_DEVICES = [
  "比喻",
  "擬人／擬物",
  "排比",
  "誇張",
  "設問",
  "反問",
  "對偶",
  "對比",
  "反復",
] as const;

export type ZhongwenXiezuoRhetoricDevice = (typeof ZHONGWEN_XIEZUO_RHETORIC_DEVICES)[number];

export const ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL = ZHONGWEN_XIEZUO_RHETORIC_DEVICES.join("、");

export function isZhongwenXiezuoRhetoricDevice(value: string): value is ZhongwenXiezuoRhetoricDevice {
  return (ZHONGWEN_XIEZUO_RHETORIC_DEVICES as readonly string[]).includes(value);
}
