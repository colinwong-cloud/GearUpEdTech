import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import subsetFont from "subset-font";
import type { ZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";
import {
  zhongwenXiezuoPdfFontCorpus,
  type ZhongwenXiezuoPdfKind,
} from "@/lib/zhongwen-xiezuo/worksheet-pdf";
import { ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL } from "@/lib/zhongwen-xiezuo/rhetoric";
import { practicePaperDateLine } from "@/lib/server/tutor-practice-paper-pdf";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 54;
const BODY = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.35, 0.38, 0.42);
const TITLE_SIZE = 18;
const META_SIZE = 12;
const BODY_SIZE = 13;
const SMALL_SIZE = 11;
const BRAND_INSET = 22;
const LOGO_HEIGHT = 42;
const MASCOT_HEIGHT = 72;

const practiceFontUrl = new URL("./assets/NotoSansTC-subset.ttf", import.meta.url);
const practiceLogoUrl = new URL("./assets/gearup-edutech-logo.png", import.meta.url);
const practiceMascotUrl = new URL("./assets/gearup-banana-mascot.png", import.meta.url);

let fontBytes: Buffer | null = null;

function readBundledFile(moduleUrl: URL, filename: string): Buffer {
  try {
    return readFileSync(fileURLToPath(moduleUrl));
  } catch {
    return readFileSync(path.join(process.cwd(), "src/lib/server/assets", filename));
  }
}

function loadFontBytes(): Buffer {
  if (!fontBytes) {
    fontBytes = readBundledFile(practiceFontUrl, "NotoSansTC-subset.ttf");
  }
  return fontBytes;
}

async function embedFont(pdf: PDFDocument, text: string): Promise<PDFFont> {
  const source = loadFontBytes();
  try {
    const subsetBytes = await subsetFont(source, text, { targetFormat: "truetype" });
    if (subsetBytes.byteLength > 1000) {
      return await pdf.embedFont(subsetBytes, { subset: false });
    }
  } catch {
    // fall back
  }
  return pdf.embedFont(source, { subset: false });
}

function canDraw(font: PDFFont, character: string, cache: Map<string, boolean>): boolean {
  const cached = cache.get(character);
  if (cached !== undefined) return cached;
  try {
    font.widthOfTextAtSize(character, 12);
    cache.set(character, true);
    return true;
  } catch {
    cache.set(character, false);
    return false;
  }
}

function sanitizeText(font: PDFFont, value: string, cache: Map<string, boolean>): string {
  let output = "";
  for (const character of value) {
    if (character === "\n" || character === "\r" || character === "\t") {
      output += character === "\t" ? " " : character === "\r" ? "" : "\n";
      continue;
    }
    output += canDraw(font, character, cache) ? character : " ";
  }
  return output;
}

function wrapText(
  font: PDFFont,
  text: string,
  maxWidth: number,
  size: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    let line = "";
    for (const ch of para) {
      const test = line + ch;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (para === "" && paragraphs.length > 1) lines.push("");
  }
  return lines.length ? lines : [""];
}

function drawFirstPageBrand(
  page: ReturnType<PDFDocument["addPage"]>,
  logo: PDFImage,
  mascot: PDFImage
): number {
  const top = PAGE_HEIGHT - BRAND_INSET;
  const logoWidth = LOGO_HEIGHT * (logo.width / logo.height);
  const mascotWidth = MASCOT_HEIGHT * (mascot.width / mascot.height);
  page.drawImage(logo, {
    x: BRAND_INSET,
    y: top - LOGO_HEIGHT,
    width: logoWidth,
    height: LOGO_HEIGHT,
  });
  page.drawImage(mascot, {
    x: PAGE_WIDTH - BRAND_INSET - mascotWidth,
    y: top - MASCOT_HEIGHT,
    width: mascotWidth,
    height: MASCOT_HEIGHT,
  });
  return top - MASCOT_HEIGHT - 16;
}

export async function buildZhongwenXiezuoPdf({
  kind,
  studentName,
  content,
}: {
  kind: ZhongwenXiezuoPdfKind;
  studentName: string;
  content: ZhongwenXiezuoGeneratedContent;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await embedFont(pdf, zhongwenXiezuoPdfFontCorpus(content));
  const glyphCache = new Map<string, boolean>();
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const logo = await pdf.embedPng(readBundledFile(practiceLogoUrl, "gearup-edutech-logo.png"));
  const mascot = await pdf.embedPng(readBundledFile(practiceMascotUrl, "gearup-banana-mascot.png"));

  const drawWrapped = (
    page: ReturnType<PDFDocument["addPage"]>,
    yRef: { y: number },
    text: string,
    size: number,
    color = BODY
  ) => {
    const safe = sanitizeText(font, text, glyphCache);
    for (const line of wrapText(font, safe, contentWidth, size)) {
      if (yRef.y < MARGIN + size) break;
      page.drawText(line, { x: MARGIN, y: yRef.y - size, size, font, color });
      yRef.y -= size + 6;
    }
  };

  const addPage = () => {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const yRef = { y: drawFirstPageBrand(page, logo, mascot) };
    return { page, yRef };
  };

  const title =
    kind === "answer" ? "GearUp 中文寫作 · 答案卷（家長）" : "GearUp 中文寫作 · 學生練習卷";

  // Page 1
  let { page, yRef } = addPage();
  drawWrapped(page, yRef, title, TITLE_SIZE);
  drawWrapped(page, yRef, `學生：${studentName || "—"}`, META_SIZE);
  drawWrapped(page, yRef, practicePaperDateLine(), META_SIZE);
  if (kind === "answer") {
    drawWrapped(page, yRef, "家長參考。標示修辭手法（含誇張等）。", META_SIZE, MUTED);
  }
  yRef.y -= 8;
  page.drawLine({
    start: { x: MARGIN, y: yRef.y },
    end: { x: PAGE_WIDTH - MARGIN, y: yRef.y },
    thickness: 0.6,
    color: MUTED,
  });
  yRef.y -= 20;

  drawWrapped(page, yRef, "第一頁：選詞填空（詞語庫）", META_SIZE);
  if (kind === "practice") {
    drawWrapped(page, yRef, `詞語庫：${content.source_phrases.join("　")}`, BODY_SIZE);
    yRef.y -= 4;
  }
  for (const item of content.page1_cloze) {
    const line =
      kind === "answer"
        ? `${item.number}. ${item.sentence_with_blank.replace(/＿+/gu, item.answer)}`
        : `${item.number}. ${item.sentence_with_blank}`;
    drawWrapped(page, yRef, line, BODY_SIZE);
  }

  // Page 2
  ({ page, yRef } = addPage());
  drawWrapped(page, yRef, "第二頁：選詞填空（無詞語庫）", META_SIZE);
  for (const item of content.page2_cloze) {
    const line =
      kind === "answer"
        ? `${item.number}. ${item.sentence_with_blank.replace(/＿+/gu, item.answer)}`
        : `${item.number}. ${item.sentence_with_blank}`;
    drawWrapped(page, yRef, line, BODY_SIZE);
  }

  // Page 3
  ({ page, yRef } = addPage());
  drawWrapped(page, yRef, "第三頁：範文（請抄寫）", META_SIZE);
  drawWrapped(page, yRef, content.essay, BODY_SIZE);
  yRef.y -= 6;

  if (kind === "answer" && content.rhetoric_marks.length > 0) {
    drawWrapped(page, yRef, `修辭手法（${ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL}）`, META_SIZE);
    for (const mark of content.rhetoric_marks) {
      const device = mark.device === "夸張" ? "誇張" : mark.device;
      drawWrapped(page, yRef, `【${device}】${mark.excerpt}`, SMALL_SIZE, MUTED);
    }
    yRef.y -= 6;
  }

  if (kind === "practice") {
    drawWrapped(page, yRef, "抄寫區（橫線）：", META_SIZE);
    const lineYStart = yRef.y;
    let lineY = lineYStart;
    const lineSpacing = 28;
    const minY = MARGIN + 40;
    while (lineY > minY) {
      page.drawLine({
        start: { x: MARGIN, y: lineY },
        end: { x: PAGE_WIDTH - MARGIN, y: lineY },
        thickness: 0.5,
        color: MUTED,
      });
      lineY -= lineSpacing;
    }
  }

  return pdf.save();
}
