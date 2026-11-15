import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import subsetFont from "subset-font";
import type { ZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";
import {
  ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING,
  ZHONGWEN_XIEZUO_SECTION1_TITLE,
  ZHONGWEN_XIEZUO_SECTION2_TITLE,
  ZHONGWEN_XIEZUO_SECTION3_TITLE,
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
const LINE_GAP = 6;
const BOTTOM_Y = MARGIN + 20;

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
  return await pdf.embedFont(source, { subset: false });
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

export function zhongwenXiezuoClozeLineForPdf(
  kind: ZhongwenXiezuoPdfKind,
  item: { number: number; sentence_with_blank: string; answer: string }
): string {
  return kind === "answer"
    ? `${item.number}. ${item.sentence_with_blank.replace(/＿+/gu, item.answer)}`
    : `${item.number}. ${item.sentence_with_blank}`;
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

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let yRef = { y: drawFirstPageBrand(page, logo, mascot) };

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    yRef = { y: drawFirstPageBrand(page, logo, mascot) };
  };

  const needsNewPage = (lineSize: number) => yRef.y < BOTTOM_Y + lineSize;

  const drawWrapped = (
    text: string,
    size: number,
    color = BODY,
    onContinuation?: () => void
  ) => {
    const safe = sanitizeText(font, text, glyphCache);
    for (const line of wrapText(font, safe, contentWidth, size)) {
      if (needsNewPage(size)) {
        addPage();
        onContinuation?.();
      }
      page.drawText(line, { x: MARGIN, y: yRef.y - size, size, font, color });
      yRef.y -= size + LINE_GAP;
    }
  };

  const title =
    kind === "answer" ? "增分寶 中文寫作 · 答案卷（家長）" : "增分寶 中文寫作 · 學生練習卷";

  drawWrapped(title, TITLE_SIZE);
  drawWrapped(`學生：${studentName || "—"}`, META_SIZE);
  drawWrapped(practicePaperDateLine(), META_SIZE);
  if (kind === "answer") {
    drawWrapped("家長參考。標示修辭手法（含誇張等）。", META_SIZE, MUTED);
  }
  yRef.y -= 8;
  page.drawLine({
    start: { x: MARGIN, y: yRef.y },
    end: { x: PAGE_WIDTH - MARGIN, y: yRef.y },
    thickness: 0.6,
    color: MUTED,
  });
  yRef.y -= 20;

  const drawSection1Header = () => {
    drawWrapped(ZHONGWEN_XIEZUO_SECTION1_TITLE, META_SIZE);
    if (kind === "practice") {
      drawWrapped(`詞語庫：${content.source_phrases.join("　")}`, BODY_SIZE);
      yRef.y -= 4;
    }
  };

  drawSection1Header();
  for (const item of content.page1_cloze) {
    drawWrapped(zhongwenXiezuoClozeLineForPdf(kind, item), BODY_SIZE, BODY, drawSection1Header);
  }

  addPage();
  const drawSection2Header = () => {
    drawWrapped(ZHONGWEN_XIEZUO_SECTION2_TITLE, META_SIZE);
  };
  drawSection2Header();
  for (const item of content.page2_cloze) {
    drawWrapped(zhongwenXiezuoClozeLineForPdf(kind, item), BODY_SIZE, BODY, drawSection2Header);
  }

  addPage();
  const drawSection3Header = () => {
    drawWrapped(ZHONGWEN_XIEZUO_SECTION3_TITLE, META_SIZE);
  };
  drawSection3Header();
  drawWrapped(content.essay, BODY_SIZE, BODY, drawSection3Header);
  yRef.y -= 6;

  if (kind === "answer" && content.rhetoric_marks.length > 0) {
    drawWrapped(`修辭手法（${ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL}）`, META_SIZE);
    for (const mark of content.rhetoric_marks) {
      const device = mark.device === "夸張" ? "誇張" : mark.device;
      drawWrapped(`【${device}】${mark.excerpt}`, SMALL_SIZE, MUTED);
    }
    yRef.y -= 6;
  }

  if (kind === "practice") {
    drawWrapped("抄寫區（橫線）：", META_SIZE);
    const lineSpacing = ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING;
    const minY = MARGIN + 40;
    const essayLineCount = wrapText(font, sanitizeText(font, content.essay, glyphCache), contentWidth, BODY_SIZE).length;
    const ruledLineTarget = Math.max(essayLineCount + 2, 8);
    let lineY = yRef.y;
    let drawn = 0;
    while (drawn < ruledLineTarget) {
      if (lineY <= minY) {
        addPage();
        lineY = yRef.y - 8;
      }
      page.drawLine({
        start: { x: MARGIN, y: lineY },
        end: { x: PAGE_WIDTH - MARGIN, y: lineY },
        thickness: 0.5,
        color: MUTED,
      });
      lineY -= lineSpacing;
      drawn += 1;
    }
    yRef.y = lineY;
  }

  return pdf.save();
}