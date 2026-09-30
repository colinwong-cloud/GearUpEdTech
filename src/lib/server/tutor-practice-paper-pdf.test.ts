import { readFileSync } from "fs";
import { inflateSync } from "zlib";
import fontkit from "@pdf-lib/fontkit";
import { describe, expect, it } from "vitest";
import { buildPracticePaperPdf } from "./tutor-practice-paper-pdf";
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

const passage = "看到上人立刻信並寫一封道歉信，楚辭要提出改正方法。全班同學到老公布。";
const studentGlyphs = `練習卷學生陳小明${passage}立刻相信並轉發提出改正方法查證資料思考是否合理完全不關生事`;
const answerGlyphs = `${studentGlyphs}答案解釋`;

function extractEmbeddedCff(pdf: Uint8Array): Buffer {
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
    if (decoded.length > 8 && decoded[0] === 1 && decoded[1] === 0 && decoded[2] >= 4) return decoded;
    offset = end + "endstream".length;
  }
  throw new Error("embedded CFF font not found");
}

function embeddedOutlineSvgs(cff: Buffer): Set<string> {
  const fontBytes = readFileSync(new URL("./assets/NotoSansTC-subset.otf", import.meta.url));
  const font = fontkit.create(fontBytes) as {
    "CFF ": {
      stream: { constructor: new (bytes: Uint8Array) => unknown };
      constructor: new (stream: unknown) => { topDict: { CharStrings: { length: number } } };
    };
    getGlyph(gid: number): { constructor: new (gid: number, unicodes: number[], font: object) => { path: { toSVG(): string } } };
  };
  const parsedFont = font["CFF "];
  const stream = new parsedFont.stream.constructor(cff);
  const parsed = new parsedFont.constructor(stream);
  const Glyph = font.getGlyph(1).constructor;
  const outlines = new Set<string>();
  for (let gid = 1; gid < parsed.topDict.CharStrings.length; gid += 1) {
    outlines.add(new Glyph(gid, [], { stream, "CFF ": parsed }).path.toSVG());
  }
  return outlines;
}

function missingOutlines(cff: Buffer, text: string): string[] {
  const fontBytes = readFileSync(new URL("./assets/NotoSansTC-subset.otf", import.meta.url));
  const font = fontkit.create(fontBytes) as {
    glyphForCodePoint(codePoint: number): { path: { toSVG(): string } };
  };
  const outlines = embeddedOutlineSvgs(cff);
  const missing: string[] = [];
  for (const character of new Set(text)) {
    const svg = font.glyphForCodePoint(character.codePointAt(0) ?? 0).path.toSVG();
    if (!outlines.has(svg)) missing.push(character);
  }
  return missing;
}

describe("buildPracticePaperPdf", () => {
  it("builds a student paper and an answer paper in Chinese", async () => {
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
      createdAt: new Date("2026-09-30T02:00:00.000Z"),
      questions,
    });
    const answer = await buildPracticePaperPdf({
      kind: "answer",
      studentName: "陳小明",
      gradeLevel: "P4",
      subjectKey: "Math",
      createdAt: new Date("2026-09-30T02:00:00.000Z"),
      questions,
    });
    expect(Buffer.from(student).subarray(0, 5).toString()).toBe("%PDF-");
    expect(Buffer.from(answer).subarray(0, 5).toString()).toBe("%PDF-");
    expect(student.byteLength).toBeGreaterThan(1000);
    expect(answer.byteLength).toBeGreaterThan(student.byteLength);

    const studentCff = extractEmbeddedCff(student);
    const answerCff = extractEmbeddedCff(answer);
    expect(studentCff[3]).toBe(4);
    expect(answerCff[3]).toBe(4);
    expect(missingOutlines(studentCff, studentGlyphs)).toEqual([]);
    expect(missingOutlines(answerCff, answerGlyphs)).toEqual([]);
  }, 20000);
});
