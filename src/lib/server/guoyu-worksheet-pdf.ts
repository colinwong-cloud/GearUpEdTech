import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import subsetFont from "subset-font";
import type { GuoyuWorksheetRow } from "@/lib/guoyu/worksheet";
import {
  guoyuWorksheetBlankPinyinDisplay,
  guoyuWorksheetPdfFontCorpus,
  type GuoyuWorksheetPdfKind,
} from "@/lib/guoyu/worksheet-pdf";
import { practicePaperDateLine } from "@/lib/server/tutor-practice-paper-pdf";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 54;
const BODY = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.35, 0.38, 0.42);
const PINYIN_SIZE = 9;
const CHAR_SIZE = 14;
const CELL_GAP = 4;
const ROW_GAP = 18;
const PRACTICE_LINE_HEIGHT = 14;
const TITLE_SIZE = 20;
const META_SIZE = 13;
const BRAND_INSET = 22;
const LOGO_HEIGHT = 42;
const MASCOT_HEIGHT = 72;

let fontBytes: Buffer | null = null;

const practiceFontUrl = new URL("./assets/NotoSansTC-subset.ttf", import.meta.url);
const practiceLogoUrl = new URL("./assets/gearup-edutech-logo.png", import.meta.url);
const practiceMascotUrl = new URL("./assets/gearup-banana-mascot.png", import.meta.url);

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

async function embedWorksheetFont(pdf: PDFDocument, text: string): Promise<PDFFont> {
  const source = loadFontBytes();
  try {
    const subsetBytes = await subsetFont(source, text, { targetFormat: "truetype" });
    if (subsetBytes.byteLength > 1000) {
      return await pdf.embedFont(subsetBytes, { subset: false });
    }
  } catch {
    // Fall back to the bundled face.
  }
  return pdf.embedFont(source, { subset: false });
}

function cellPinyinText(
  cell: { char: string; pinyin: string },
  mode: GuoyuWorksheetPdfKind
): string {
  if (mode === "answer") return cell.pinyin.trim() || "·";
  return guoyuWorksheetBlankPinyinDisplay(cell.char);
}

function measureCellWidth(font: PDFFont, pinyinText: string, char: string): number {
  const pinyinWidth = font.widthOfTextAtSize(pinyinText, PINYIN_SIZE);
  const charWidth = font.widthOfTextAtSize(char, CHAR_SIZE);
  return Math.max(pinyinWidth, charWidth, 10) + CELL_GAP;
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

function drawWorksheetRow(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
  glyphCache: Map<string, boolean>,
  y: number,
  row: GuoyuWorksheetRow,
  mode: GuoyuWorksheetPdfKind,
  contentWidth: number
): number {
  const startX = MARGIN;
  let x = startX;
  let rowTop = y;
  let minY = y;

  for (const cell of row.cells) {
    const pinyinText = sanitizeText(font, cellPinyinText(cell, mode), glyphCache);
    const charText = sanitizeText(font, cell.char, glyphCache);
    const cellWidth = measureCellWidth(font, pinyinText, charText);
    if (x + cellWidth > MARGIN + contentWidth && x > startX) {
      x = startX;
      rowTop -= CHAR_SIZE + PINYIN_SIZE + 6;
      minY = rowTop;
    }
    page.drawText(pinyinText, {
      x: x + (cellWidth - font.widthOfTextAtSize(pinyinText, PINYIN_SIZE)) / 2,
      y: rowTop - PINYIN_SIZE,
      size: PINYIN_SIZE,
      font,
      color: mode === "answer" ? rgb(0.2, 0.35, 0.75) : MUTED,
    });
    page.drawText(charText, {
      x: x + (cellWidth - font.widthOfTextAtSize(charText, CHAR_SIZE)) / 2,
      y: rowTop - PINYIN_SIZE - CHAR_SIZE - 2,
      size: CHAR_SIZE,
      font,
      color: BODY,
    });
    x += cellWidth;
  }

  let nextY = minY - PINYIN_SIZE - CHAR_SIZE - 6;
  if (row.blankPracticeLine) {
    nextY -= 4;
    page.drawLine({
      start: { x: MARGIN, y: nextY },
      end: { x: PAGE_WIDTH - MARGIN, y: nextY },
      thickness: 0.6,
      color: MUTED,
      dashArray: [3, 3],
    });
    nextY -= PRACTICE_LINE_HEIGHT;
  }
  return nextY - ROW_GAP;
}

export async function buildGuoyuWorksheetPdf({
  kind,
  studentName,
  rows,
}: {
  kind: GuoyuWorksheetPdfKind;
  studentName: string;
  rows: GuoyuWorksheetRow[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await embedWorksheetFont(pdf, guoyuWorksheetPdfFontCorpus(rows));
  const glyphCache = new Map<string, boolean>();
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const logo = await pdf.embedPng(readBundledFile(practiceLogoUrl, "gearup-edutech-logo.png"));
  const mascot = await pdf.embedPng(readBundledFile(practiceMascotUrl, "gearup-banana-mascot.png"));

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = drawFirstPageBrand(page, logo, mascot);
  let pageIndex = 1;

  const ensureSpace = (height: number) => {
    if (y - height >= MARGIN) return;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageIndex += 1;
    y = PAGE_HEIGHT - MARGIN;
    const cont = kind === "answer" ? "答案卷" : "練習卷（空白拼音）";
    page.drawText(sanitizeText(font, `GearUp 國語練習 · ${cont} · 續`, glyphCache), {
      x: MARGIN,
      y: y - META_SIZE,
      size: META_SIZE,
      font,
      color: BODY,
    });
    y -= META_SIZE + 8;
    page.drawText(sanitizeText(font, `第 ${pageIndex} 頁`, glyphCache), {
      x: MARGIN,
      y: y - 11,
      size: 11,
      font,
      color: MUTED,
    });
    y -= 20;
  };

  const drawHeading = (text: string, size: number) => {
    ensureSpace(size + 10);
    const safe = sanitizeText(font, text, glyphCache);
    page.drawText(safe, {
      x: MARGIN,
      y: y - size,
      size,
      font,
      color: BODY,
    });
    y -= size + 10;
  };

  const title =
    kind === "answer" ? "GearUp 國語練習 · 答案卷" : "GearUp 國語練習 · 練習卷（空白拼音）";
  drawHeading(title, TITLE_SIZE);
  drawHeading(`學生：${studentName || "—"}`, META_SIZE);
  drawHeading(practicePaperDateLine(), META_SIZE);
  if (kind === "answer") {
    drawHeading("導師參考。請勿派發給學生。", META_SIZE);
  }
  ensureSpace(12);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.6,
    color: MUTED,
  });
  y -= 22;

  if (kind === "practice") {
    for (const row of rows) {
      ensureSpace(CHAR_SIZE + PINYIN_SIZE + PRACTICE_LINE_HEIGHT + ROW_GAP);
      y = drawWorksheetRow(page, font, glyphCache, y, row, "practice", contentWidth);
    }
  } else {
    if (rows.length > 0) {
      drawHeading("範例", META_SIZE);
      ensureSpace(CHAR_SIZE + PINYIN_SIZE + PRACTICE_LINE_HEIGHT + ROW_GAP);
      y = drawWorksheetRow(page, font, glyphCache, y, rows[0], "answer", contentWidth);
    }
    if (rows.length > 1) {
      drawHeading("答案", META_SIZE);
      for (const row of rows.slice(1)) {
        ensureSpace(CHAR_SIZE + PINYIN_SIZE + PRACTICE_LINE_HEIGHT + ROW_GAP);
        y = drawWorksheetRow(page, font, glyphCache, y, row, "answer", contentWidth);
      }
    }
  }

  return pdf.save();
}
