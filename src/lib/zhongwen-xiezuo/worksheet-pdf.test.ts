import { inflateSync } from "zlib";
import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFContentStream, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildZhongwenXiezuoPdf } from "@/lib/server/zhongwen-xiezuo-pdf";
import type { ZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";
import {
  ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING,
  ZHONGWEN_XIEZUO_PDF_STATIC_LABELS,
  zhongwenXiezuoPdfFontCorpus,
} from "@/lib/zhongwen-xiezuo/worksheet-pdf";
import { ZHONGWEN_XIEZUO_RHETORIC_DEVICES, ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL } from "@/lib/zhongwen-xiezuo/rhetoric";

const sample: ZhongwenXiezuoGeneratedContent = {
  version: 1,
  source_phrases: ["晴朗", "微風"],
  page1_cloze: [{ number: 1, sentence_with_blank: "今天天氣天氣天氣＿＿＿。", answer: "晴朗" }],
  page2_cloze: [{ number: 1, sentence_with_blank: "樹葉隨＿＿＿搖動。", answer: "微風" }],
  essay: "今天是個晴朗的日子，微風輕輕吹過，像母親的手撫過臉龐。",
  rhetoric_marks: [
    { device: "誇張", excerpt: "風聲響徹雲霄" },
    { device: "排比", excerpt: "花開、葉、葉綠、鳥鳴" },
    { device: "反問", excerpt: "難道這不是春天嗎" },
    { device: "對偶", excerpt: "山高水長" },
  ],
};

const sectionTitles = [
  "第一頁：選詞填空（詞語庫）",
  "第二頁：選詞填空（無詞語庫）",
  "第三頁：範文（請抄寫）",
] as const;

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

function extractRuledLineYs(pdfBytes: Uint8Array): number[] {
  const pdf = PDFDocument.load(pdfBytes);
  return pdf.then((doc) => {
    const ys: number[] = [];
    for (const page of doc.getPages()) {
      const content = pageContent(page);
      const re = /([\d.]+) ([\d.]+) m\s+[\d.]+ [\d.]+ m\s+([\d.]+) ([\d.]+) l/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const y = Number(match[2]);
        if (Math.abs(y - Number(match[4])) < 0.01) ys.push(y);
      }
    }
    ys.sort((a, b) => b - a);
    return ys;
  });
}

describe("zhongwen-xiezuo pdf", () => {
  it("static font corpus includes all section titles and rhetoric devices", () => {
    const corpus = zhongwenXiezuoPdfFontCorpus(sample);
    for (const title of sectionTitles) {
      for (const ch of title) {
        expect(corpus).toContain(ch);
      }
    }
    for (const device of ZHONGWEN_XIEZUO_RHETORIC_DEVICES) {
      for (const ch of device.replace("/", "")) {
        expect(corpus).toContain(ch);
      }
    }
    expect(ZHONGWEN_XIEZUO_PDF_STATIC_LABELS).toContain(ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL);
  });

  it("builds practice and answer PDFs with embedded glyphs for static labels", async () => {
    const practice = await buildZhongwenXiezuoPdf({
      kind: "practice",
      studentName: "測試",
      content: sample,
    });
    const answer = await buildZhongwenXiezuoPdf({
      kind: "answer",
      studentName: "測試",
      content: sample,
    });
    expect(practice.byteLength).toBeGreaterThan(500);
    expect(answer.byteLength).toBeGreaterThan(500);

    const staticGlyphs = `${sectionTitles.join("")}【】${ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL}抄寫區（橫線）`;
    const practiceFont = extractEmbeddedTrueType(practice);
    const answerFont = extractEmbeddedTrueType(answer);
    expect(missingGlyphs(practiceFont, staticGlyphs)).toEqual([]);
    expect(missingGlyphs(answerFont, staticGlyphs)).toEqual([]);
    expect(missingGlyphs(answerFont, ZHONGWEN_XIEZUO_RHETORIC_DEVICES.join(""))).toEqual([]);
  }, 20_000);

  it("uses 2× ruled-line spacing for 抄寫 on the practice PDF", async () => {
    const longEssay = "春".repeat(400);
    const content: ZhongwenXiezuoGeneratedContent = { ...sample, essay: longEssay };
    const practice = await buildZhongwenXiezuoPdf({
      kind: "practice",
      studentName: "測試",
      content,
    });
    const ys = await extractRuledLineYs(practice);
    expect(ys.length).toBeGreaterThanOrEqual(3);
    const gaps: number[] = [];
    for (let i = 0; i < ys.length - 1; i += 1) {
      gaps.push(ys[i] - ys[i + 1]);
    }
    const ruledGaps = gaps.filter((g) => g >= ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING - 2);
    expect(ruledGaps.length).toBeGreaterThan(0);
    expect(ruledGaps[0]).toBeGreaterThanOrEqual(ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING - 1);
    expect(ruledGaps[0]).toBeLessThanOrEqual(ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING + 1);
  }, 20_000);
});