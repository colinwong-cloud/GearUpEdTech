import { describe, expect, it } from "vitest";
import {
  ZHONGWEN_XIEZUO_RHETORIC_DEVICES,
  ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL,
  isZhongwenXiezuoRhetoricDevice,
} from "@/lib/zhongwen-xiezuo/rhetoric";

describe("zhongwen-xiezuo rhetoric devices", () => {
  it("uses owner-locked Traditional 誇張 not simplified 夸張", () => {
    expect(ZHONGWEN_XIEZUO_RHETORIC_DEVICES).toContain("誇張");
    expect(ZHONGWEN_XIEZUO_RHETORIC_DEVICES).not.toContain("夸張");
    expect(ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL).toContain("誇張");
    expect(ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL).not.toContain("夸張");
  });

  it("lists all nine owner devices", () => {
    expect(ZHONGWEN_XIEZUO_RHETORIC_DEVICES).toEqual([
      "比喻",
      "擬人／擬物",
      "排比",
      "誇張",
      "設問",
      "反問",
      "對偶",
      "對比",
      "反復",
    ]);
    expect(isZhongwenXiezuoRhetoricDevice("誇張")).toBe(true);
    expect(isZhongwenXiezuoRhetoricDevice("夸張")).toBe(false);
  });
});
