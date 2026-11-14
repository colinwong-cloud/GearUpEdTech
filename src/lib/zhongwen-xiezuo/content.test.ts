import { describe, expect, it } from "vitest";
import { hasZhongwenXiezuoInput, parseParentPhraseInput } from "@/lib/zhongwen-xiezuo/content";

const OWNER_SPACE_PHRASES =
  "歡樂年年 龍馬精神 萬事大吉 家中長輩 開年飯 利是 遊戲 團圓";

describe("parseParentPhraseInput", () => {
  it("splits on ASCII spaces", () => {
    expect(parseParentPhraseInput("晴朗 微風")).toEqual(["晴朗", "微風"]);
    expect(hasZhongwenXiezuoInput("晴朗 微風")).toBe(true);
  });

  it("splits on full-width ideographic space U+3000", () => {
    const raw = "詞甲\u3000詞乙\u3000詞丙";
    expect(parseParentPhraseInput(raw)).toEqual(["詞甲", "詞乙", "詞丙"]);
  });

  it("splits on 頓號 and ignores empty tokens from repeated delimiters", () => {
    expect(parseParentPhraseInput("甲、乙、、丙")).toEqual(["甲", "乙", "丙"]);
    expect(parseParentPhraseInput("甲  \n  乙")).toEqual(["甲", "乙"]);
  });

  it("handles mixed delimiters", () => {
    expect(parseParentPhraseInput("甲,乙\n丙、丁 戊")).toEqual(["甲", "乙", "丙", "丁", "戊"]);
  });

  it("parses owner space-only example into at least eight phrases", () => {
    const phrases = parseParentPhraseInput(OWNER_SPACE_PHRASES);
    expect(phrases.length).toBeGreaterThanOrEqual(8);
    expect(phrases).toEqual([
      "歡樂年年",
      "龍馬精神",
      "萬事大吉",
      "家中長輩",
      "開年飯",
      "利是",
      "遊戲",
      "團圓",
    ]);
    expect(hasZhongwenXiezuoInput(OWNER_SPACE_PHRASES)).toBe(true);
  });

  it("treats a single phrase as insufficient input", () => {
    expect(parseParentPhraseInput("只有一個詞語")).toEqual(["只有一個詞語"]);
    expect(hasZhongwenXiezuoInput("只有一個詞語")).toBe(false);
  });
});