import { describe, expect, it } from "vitest";
import {
  guoyuWorksheetBlankPinyinDisplay,
  guoyuWorksheetPdfDownloadFilename,
  parseGuoyuWorksheetRowsForPdf,
} from "@/lib/guoyu/worksheet-pdf";

describe("guoyu worksheet pdf helpers", () => {
  it("builds owner-facing download names", () => {
    const createdAt = new Date("2026-11-05T12:34:56.000Z");
    const practice = guoyuWorksheetPdfDownloadFilename({
      studentName: "小明",
      mobile: "91234567",
      kind: "practice",
      createdAt,
    });
    expect(practice.unicode).toContain("練習卷（空白拼音）");
    expect(practice.unicode).toContain("國語練習");

    const answer = guoyuWorksheetPdfDownloadFilename({
      studentName: "小明",
      mobile: "91234567",
      kind: "answer",
      createdAt,
    });
    expect(answer.unicode).toContain("答案卷");
  });

  it("parses worksheet rows with limits", () => {
    const rows = parseGuoyuWorksheetRowsForPdf([
      {
        cells: [{ char: "你", pinyin: "nǐ" }],
        blankPracticeLine: true,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(parseGuoyuWorksheetRowsForPdf([])).toBeNull();
  });

  it("uses blank markers for CJK practice cells", () => {
    expect(guoyuWorksheetBlankPinyinDisplay("好")).toBe("＿＿");
    expect(guoyuWorksheetBlankPinyinDisplay("，")).toBe("·");
  });
});
