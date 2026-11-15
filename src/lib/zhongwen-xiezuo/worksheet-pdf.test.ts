import { inflateSync } from "zlib";
import fontkit from "@pdf-lib/fontkit";
import { PDFArray, PDFContentStream, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildZhongwenXiezuoPdf, zhongwenXiezuoClozeLineForPdf } from "@/lib/server/zhongwen-xiezuo-pdf";
import {
  parseZhongwenXiezuoGeneratedContent,
  zhongwenXiezuoClozeCountPerSection,
  type ZhongwenXiezuoClozeItem,
  type ZhongwenXiezuoGeneratedContent,
} from "@/lib/zhongwen-xiezuo/content";
import {
  ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING,
  ZHONGWEN_XIEZUO_PDF_STATIC_LABELS,
  ZHONGWEN_XIEZUO_SECTION1_TITLE,
  ZHONGWEN_XIEZUO_SECTION2_TITLE,
  ZHONGWEN_XIEZUO_SECTION3_TITLE,
  zhongwenXiezuoPdfFontCorpus,
} from "@/lib/zhongwen-xiezuo/worksheet-pdf";
import { ZHONGWEN_XIEZUO_RHETORIC_DEVICES, ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL } from "@/lib/zhongwen-xiezuo/rhetoric";

const twoPhrases = ["晴朗", "微風"];

function buildClozeList(
  count: number,
  section: 1 | 2,
  options?: { longWrap?: boolean }
): ZhongwenXiezuoClozeItem[] {
  const phrase = section === 1 ? twoPhrases[0]! : twoPhrases[1]!;
  const pad = options?.longWrap ? "，我們在公園裡散步欣賞風景，心裡感到十分愉快".repeat(4) : "";
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    sentence_with_blank:
      section === 1
        ? `${pad}今天天氣天氣＿＿＿，微風輕拂。`
        : pad + "樹葉隨＿＿＿輕輕搖動。",
    answer: phrase,
  }));
}

function buildContent(overrides?: Partial<ZhongwenXiezuoGeneratedContent>): ZhongwenXiezuoGeneratedContent {
  const perSection = zhongwenXiezuoClozeCountPerSection(twoPhrases.length);
  return {
    version: 1,
    source_phrases: twoPhrases,
    page1_cloze: buildClozeList(perSection, 1),
    page2_cloze: buildClozeList(perSection, 2),
    essay: "今天是個晴朗的日子，微風輕輕吹過，像母親的手撫過臉龐。",
    rhetoric_marks: [
      { device: "誇張", excerpt: "風聲響徹雲霄" },
      { device: "排比", excerpt: "花開、葉綠、鳥鳴" },
      { device: "反問", excerpt: "難道這不是春天嗎" },
      { device: "對偶", excerpt: "山高水長" },
    ],
    ...overrides,
  };
}

const sample = buildContent();

const sectionTitles = [
  ZHONGWEN_XIEZUO_SECTION1_TITLE,
  ZHONGWEN_XIEZUO_SECTION2_TITLE,
  ZHONGWEN_XIEZUO_SECTION3_TITLE,
] as const;

/** Historical Soft #256 label kept for feature-contract regression inventory. */
const SOFT256_SECTION2_TITLE = "第二頁：選詞填空（無詞語庫）";

const TEN_PHRASES = [
  "鄰居",
  "伙伴",
  "長輩",
  "遊客",
  "照顧",
  "拜年",
  "開心",
  "傳統",
  "團圓",
  "祝福",
];

function buildTenPhraseOverflowContent(): ZhongwenXiezuoGeneratedContent {
  const perSection = zhongwenXiezuoClozeCountPerSection(10);
  expect(perSection).toBe(15);
  const longPad =
    "在春節團聚的日子裡，我們走訪親友、分享佳肴、互送祝福，心中充滿喜悅與期待，";
  const page1_cloze = Array.from({ length: perSection }, (_, index) => ({
    number: index + 1,
    sentence_with_blank: `${longPad}我們一起＿＿＿，渡過美好時光。`,
    answer: TEN_PHRASES[index % TEN_PHRASES.length]!,
  }));
  const page2_cloze = Array.from({ length: perSection }, (_, index) => ({
    number: index + 1,
    sentence_with_blank: `${longPad}他十分＿＿＿地走進客廳。`,
    answer: TEN_PHRASES[(index + 3) % TEN_PHRASES.length]!,
  }));
  return {
    version: 1,
    source_phrases: TEN_PHRASES,
    page1_cloze,
    page2_cloze,
    essay:
      "春節到了，鄰居互相拜年，伙伴一起玩耍，長輩細心照顧遊客。大家心中開心，傳統習俗讓家人團圓，互送祝福。",
    rhetoric_marks: [{ device: "排比", excerpt: "拜年、玩耍、照顧" }],
  };
}

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
  it("ceil(1.5×n) per cloze section for representative phrase counts", () => {
    expect(zhongwenXiezuoClozeCountPerSection(2)).toBe(3);
    expect(zhongwenXiezuoClozeCountPerSection(10)).toBe(15);
    expect(zhongwenXiezuoClozeCountPerSection(11)).toBe(17);
  });

  it("rejects generated content when cloze lists do not match ceil(1.5×n)", () => {
    const bad = {
      version: 1,
      source_phrases: twoPhrases,
      page1_cloze: buildClozeList(2, 1),
      page2_cloze: buildClozeList(3, 2),
      essay: "晴朗與微風相伴。",
      rhetoric_marks: [],
    };
    expect(parseZhongwenXiezuoGeneratedContent(bad)).toBeNull();
    expect(parseZhongwenXiezuoGeneratedContent(sample)).not.toBeNull();
  });

  it("static font corpus includes all section titles and rhetoric devices", () => {
    expect(SOFT256_SECTION2_TITLE).not.toEqual(ZHONGWEN_XIEZUO_SECTION2_TITLE);
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
    expect(ZHONGWEN_XIEZUO_PDF_STATIC_LABELS).toContain(ZHONGWEN_XIEZUO_SECTION1_TITLE);
    expect(ZHONGWEN_XIEZUO_PDF_STATIC_LABELS).toContain("部");
    expect(ZHONGWEN_XIEZUO_PDF_STATIC_LABELS).toContain("供");
    expect(ZHONGWEN_XIEZUO_PDF_STATIC_LABELS).toContain("充");
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

  it("answer sheet includes filled answers for every cloze item in both sections", () => {
    const content = buildContent();
    for (const item of [...content.page1_cloze, ...content.page2_cloze]) {
      const line = zhongwenXiezuoClozeLineForPdf("answer", item);
      expect(line).toContain(item.answer);
      expect(line).not.toMatch(/＿/u);
    }
    expect(content.page1_cloze).toHaveLength(zhongwenXiezuoClozeCountPerSection(content.source_phrases.length));
    expect(content.page2_cloze).toHaveLength(zhongwenXiezuoClozeCountPerSection(content.source_phrases.length));
  });

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
      gaps.push(ys[i]! - ys[i + 1]!);
    }
    const ruledGaps = gaps.filter((g) => g >= ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING - 2);
    expect(ruledGaps.length).toBeGreaterThan(0);
    expect(ruledGaps[0]).toBeGreaterThanOrEqual(ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING - 1);
    expect(ruledGaps[0]).toBeLessThanOrEqual(ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING + 1);
  }, 20_000);

  it("10-phrase fixture: 15+15 cloze and multi-page overflow without compressing layout", async () => {
    const content = buildTenPhraseOverflowContent();
    expect(content.page1_cloze).toHaveLength(15);
    expect(content.page2_cloze).toHaveLength(15);

    const compactEssay =
      "春節到了，鄰居拜年，伙伴玩耍，長輩照顧遊客，大家開心團圓送祝福。";
    const shortItems = content.page1_cloze.map((item) => ({
      ...item,
      sentence_with_blank: "我們＿＿＿。",
    }));
    const compactContent: ZhongwenXiezuoGeneratedContent = {
      ...content,
      page1_cloze: shortItems,
      page2_cloze: shortItems,
      essay: compactEssay,
    };

    const [overflowPractice, compactPractice] = await Promise.all([
      buildZhongwenXiezuoPdf({ kind: "practice", studentName: "LHP1", content }),
      buildZhongwenXiezuoPdf({ kind: "practice", studentName: "LHP1", content: compactContent }),
    ]);
    const overflowPages = (await PDFDocument.load(overflowPractice)).getPageCount();
    const compactPages = (await PDFDocument.load(compactPractice)).getPageCount();
    expect(overflowPages).toBeGreaterThanOrEqual(4);
    expect(overflowPages).toBeGreaterThan(compactPages);

    const ys = await extractRuledLineYs(overflowPractice);
    const ruledGaps = ys.slice(0, -1).map((y, i) => y - ys[i + 1]!);
    expect(ruledGaps.some((g) => g >= ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING - 2)).toBe(true);
    expect(ZHONGWEN_XIEZUO_PDF_STATIC_LABELS).not.toContain("第一頁：選詞填空");
  }, 30_000);
});