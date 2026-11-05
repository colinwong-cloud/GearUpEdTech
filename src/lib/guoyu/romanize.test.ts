import { describe, expect, it } from "vitest";
import {
  buildCellsWithTonedPinyin,
  romanizeGuoyuLines,
  syllableHasToneMark,
} from "@/lib/guoyu/romanize";

describe("guoyu romanize", () => {
  it("emits tone-marked syllables per CJK character", () => {
    const cells = buildCellsWithTonedPinyin("你好，世界");
    expect(cells[0]).toEqual({ char: "你", pinyin: "nǐ" });
    expect(cells[1]).toEqual({ char: "好", pinyin: "hǎo" });
    expect(cells[2]?.pinyin).toBe("");
    expect(cells[3]).toEqual({ char: "世", pinyin: "shì" });
    expect(cells[4]).toEqual({ char: "界", pinyin: "jiè" });
    expect(syllableHasToneMark("nǐ")).toBe(true);
    expect(syllableHasToneMark("ma")).toBe(false);
  });

  it("uses contextual reading for polyphones", () => {
    const cells = buildCellsWithTonedPinyin("银行");
    expect(cells.map((c) => c.pinyin)).toEqual(["yín", "háng"]);
  });

  it("builds romanized lines for worksheet rows", () => {
    expect(romanizeGuoyuLines(["追蹤"])).toEqual(["zhuī zōng"]);
  });
});
