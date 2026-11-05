import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildGuoyuWorksheetPdf } from "@/lib/server/guoyu-worksheet-pdf";

describe("buildGuoyuWorksheetPdf", () => {
  it("emits valid PDF bytes for practice and answer kinds", async () => {
    const rows = [
      {
        cells: [
          { char: "你", pinyin: "nǐ" },
          { char: "好", pinyin: "hǎo" },
        ],
        blankPracticeLine: true,
      },
      {
        cells: [{ char: "吗", pinyin: "ma" }],
        blankPracticeLine: true,
      },
    ];

    const practice = await buildGuoyuWorksheetPdf({
      kind: "practice",
      studentName: "測試",
      rows,
    });
    const answer = await buildGuoyuWorksheetPdf({
      kind: "answer",
      studentName: "測試",
      rows,
    });

    expect(Buffer.from(practice).subarray(0, 5).toString()).toBe("%PDF-");
    expect(Buffer.from(answer).subarray(0, 5).toString()).toBe("%PDF-");

    const pdf = await PDFDocument.load(answer);
    pdf.registerFontkit(fontkit);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });
});
