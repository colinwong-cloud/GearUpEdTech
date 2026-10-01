import { inflateSync } from "zlib";
import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFContentStream, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildPracticePaperPdf,
  practicePaperDateLine,
  practicePaperParagraphs,
} from "./tutor-practice-paper-pdf";
import type { PracticePaperQuestion } from "@/lib/tutor-practice-paper";

const sample: PracticePaperQuestion = {
  id: "q1",
  content: "3 + 4 = ?",
  opt_a: "6",
  opt_b: "7",
  opt_c: "8",
  opt_d: null,
  correct_answer: "B",
  explanation: "3 加 4 是 7。解釋要清楚。",
  image_url: null,
};

const passage = "計算：9.6 × 4 + 1.8 = ?\\n\\n4又5/8 + 2又7/8 = ?\\n看到上人立刻信並寫一封道歉信，楚辭要提出改正方法。全班同學到老公布。";
const studentGlyphs = "練習卷學生陳小明計算又看到上人立刻信並寫一封道歉信楚辭要提出改正方法全班同學到老公布立刻相信並轉發查證資料思考是否合理完全不關生事×";
const answerGlyphs = `${studentGlyphs}答案解釋`;

function extractEmbeddedTrueType(pdf: Uint8Array): Buffer {
  const data = Buffer.from(pdf);
  let offset = 0;
  while (offset < data.length) {
    const start = data.indexOf("stream", offset);
    if (start < 0) break;
    let body = start + "stream".length;
    if (data[body] === 0x0d && data[body + 1] === 0x0a) body += 2;
    else if (data[body] === 0x0a) body += 1;
    const end = data.indexOf("endstream", body);
    if (end < 0) break;
    let raw = data.subarray(body, end);
    if (raw[raw.length - 1] === 0x0a) {
      const trim = raw[raw.length - 2] === 0x0d ? 2 : 1;
      raw = raw.subarray(0, raw.length - trim);
    }
    let decoded: Buffer = raw;
    try {
      decoded = inflateSync(raw);
    } catch {
      decoded = raw;
    }
    if (decoded.length > 12 && decoded[0] === 0 && decoded[1] === 1 && decoded[2] === 0 && decoded[3] === 0) {
      return decoded;
    }
    offset = end + "endstream".length;
  }
  throw new Error("embedded TrueType font not found");
}

function missingGlyphs(ttf: Buffer, text: string): string[] {
  const font = fontkit.create(ttf) as unknown as {
    glyphForCodePoint(codePoint: number): { id: number; path: { commands: unknown[] } };
  };
  const missing: string[] = [];
  for (const character of new Set(text)) {
    const glyph = font.glyphForCodePoint(character.codePointAt(0) ?? 0);
    if (!glyph.id || glyph.path.commands.length === 0) missing.push(character);
  }
  return missing;
}

describe("practice paper text", () => {
  it("turns stored newlines into paragraphs and leaves the date blank", () => {
    expect(practicePaperParagraphs("段落一\\n\\n段落二")).toEqual(["段落一", "", "段落二"]);
    expect(practicePaperParagraphs("第一行\n第二行")).toEqual(["第一行", "第二行"]);
    expect(practicePaperDateLine()).toBe("日期：________________");
    expect(practicePaperDateLine()).not.toMatch(/\d/);
  });
});

describe("buildPracticePaperPdf", () => {
  it("embeds a TrueType face whose Chinese and math glyphs have outlines", async () => {
    const questions = Array.from({ length: 2 }, (_, index) => ({
      ...sample,
      id: `q${index}`,
      content: index === 0 ? passage : sample.content,
      opt_a: index === 0 ? "立刻相信並轉發" : sample.opt_a,
      opt_b: index === 0 ? "提出改正方法" : sample.opt_b,
      opt_c: index === 0 ? "查證資料，思考是否合理" : sample.opt_c,
      opt_d: index === 0 ? "完全不關生事" : "9",
    }));
    const student = await buildPracticePaperPdf({
      kind: "student",
      studentName: "陳小明",
      gradeLevel: "P4",
      subjectKey: "Math",
      createdAt: new Date("2026-09-30T16:00:00.000Z"),
      questions,
    });
    const answer = await buildPracticePaperPdf({
      kind: "answer",
      studentName: "陳小明",
      gradeLevel: "P4",
      subjectKey: "Math",
      createdAt: new Date("2026-09-30T16:00:00.000Z"),
      questions,
    });
    expect(Buffer.from(student).subarray(0, 5).toString()).toBe("%PDF-");
    expect(Buffer.from(answer).subarray(0, 5).toString()).toBe("%PDF-");
    expect(student.byteLength).toBeGreaterThan(1000);
    expect(student.byteLength).toBeLessThan(500_000);
    expect(answer.byteLength).toBeGreaterThan(student.byteLength);

    const studentFont = extractEmbeddedTrueType(student);
    const answerFont = extractEmbeddedTrueType(answer);
    expect(missingGlyphs(studentFont, studentGlyphs)).toEqual([]);
    expect(missingGlyphs(answerFont, answerGlyphs)).toEqual([]);
    expect(Buffer.from(student).includes(Buffer.from("01/10/2026"))).toBe(false);
    expect(Buffer.from(student).includes(Buffer.from("段落一\\n\\n"))).toBe(false);
  }, 20000);

  it("draws the logo and mascot on the first page only", async () => {
    const questions = Array.from({ length: 30 }, (_, index) => ({
      ...sample,
      id: `q${index}`,
      content: `${passage} 第${index + 1}題`,
    }));
    const bytes = await buildPracticePaperPdf({
      kind: "student",
      studentName: "陳小明",
      gradeLevel: "P4",
      subjectKey: "Math",
      createdAt: new Date("2026-09-30T16:00:00.000Z"),
      questions,
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    const draws = pdf.getPages().map((page) => pageContent(page).split(" Do").length - 1);
    expect(draws[0]).toBe(2);
    expect(draws.slice(1).every((count) => count === 0)).toBe(true);
  }, 20000);
});

function pageContent(page: ReturnType<PDFDocument["getPages"]>[number]): string {
  const contents = page.node.Contents();
  if (!contents) return "";
  const streams = contents instanceof PDFArray
    ? Array.from({ length: contents.size() }, (_, index) => contents.lookup(index))
    : [contents];
  return streams
    .map((stream) => {
      if (stream instanceof PDFRawStream) return Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
      if (stream instanceof PDFContentStream) return Buffer.from(stream.getUnencodedContents()).toString("latin1");
      return "";
    })
    .join("\n");
}
