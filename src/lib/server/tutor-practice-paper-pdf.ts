import { readFileSync } from "fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import subsetFont from "subset-font";
import { normalizeQuestionContentNewlines } from "@/lib/question-content-blocks";
import { subjectDisplayLabel } from "@/lib/quiz-subjects";
import {
  gradeDisplayLabel,
  practicePaperChoiceLines,
  type PracticePaperQuestion,
} from "@/lib/tutor-practice-paper";

declare module "subset-font" {
  function subsetFont(
    font: Uint8Array | Buffer,
    text: string,
    options?: { targetFormat?: string }
  ): Promise<Uint8Array>;
  export default subsetFont;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const BODY = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.35, 0.38, 0.42);
const PARAGRAPH_GAP = 8;

let fontBytes: Buffer | null = null;

function loadFontBytes(): Buffer {
  if (!fontBytes) {
    fontBytes = readFileSync(new URL("./assets/NotoSansTC-subset.ttf", import.meta.url));
  }
  return fontBytes;
}

/** Escaped `\\n` from question storage becomes real line breaks. A blank line is a paragraph gap. */
export function practicePaperParagraphs(value: string): string[] {
  return normalizeQuestionContentNewlines(value).split("\n");
}

/** The date row stays on the paper so the student can write it in. */
export function practicePaperDateLine(): string {
  return "日期：________________";
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

function wrapLine(font: PDFFont, line: string, size: number, maxWidth: number): string[] {
  if (!line) return [""];
  const lines: string[] = [];
  let current = "";
  for (const character of line) {
    const next = current + character;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function practicePaperFontCorpus(input: {
  studentName: string;
  gradeLevel: string;
  subjectKey: string;
  questions: PracticePaperQuestion[];
}): string {
  const chunks = [
    "GearUp 練習卷（答案）續 學生： 分數：__________ / 導師參考。請勿派發給學生。第 頁 · 答：______________________________ 答案：解釋：",
    practicePaperDateLine(),
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    "，。？！、；：「」『』（）【】《》〈〉—…．·×÷√π°％%+-*=＿_　／",
    input.studentName,
    subjectDisplayLabel(input.subjectKey),
    gradeDisplayLabel(input.gradeLevel),
    String(input.questions.length),
  ];
  for (const question of input.questions) {
    chunks.push(
      normalizeQuestionContentNewlines(question.content || ""),
      normalizeQuestionContentNewlines(question.explanation || ""),
      normalizeQuestionContentNewlines(question.correct_answer || ""),
      formatCorrectAnswer(question),
      ...practicePaperChoiceLines(question).map((line) => normalizeQuestionContentNewlines(line))
    );
  }
  const seen = new Set<string>();
  for (const chunk of chunks) {
    for (const character of chunk) {
      if (character === "\n" || character === "\r" || character === "\t") continue;
      seen.add(character);
    }
  }
  return Array.from(seen).join("");
}

// pdf-lib's CFF subsetter produces a font Acrobat cannot extract, so Chinese
// outlines drop out. HarfBuzz subsets a TrueType face, and we embed that file whole.
async function embedPracticeFont(pdf: PDFDocument, text: string): Promise<PDFFont> {
  const source = loadFontBytes();
  try {
    const subsetBytes = await subsetFont(source, text, { targetFormat: "truetype" });
    if (subsetBytes.byteLength > 1000) {
      return await pdf.embedFont(subsetBytes, { subset: false });
    }
  } catch {
    // The full TrueType face still draws. It is only used if subsetting fails.
  }
  return pdf.embedFont(source, { subset: false });
}

export async function buildPracticePaperPdf({
  kind,
  studentName,
  gradeLevel,
  subjectKey,
  questions,
  images = [],
}: {
  kind: "student" | "answer";
  studentName: string;
  gradeLevel: string;
  subjectKey: string;
  createdAt: Date;
  questions: PracticePaperQuestion[];
  images?: Array<Uint8Array | null>;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await embedPracticeFont(
    pdf,
    practicePaperFontCorpus({ studentName, gradeLevel, subjectKey, questions })
  );
  const glyphCache = new Map<string, boolean>();
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageIndex = 1;

  const ensureSpace = (height: number) => {
    if (y - height >= MARGIN) return;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageIndex += 1;
    y = PAGE_HEIGHT - MARGIN;
    drawRaw(`GearUp 練習卷${kind === "answer" ? "（答案）" : ""}  續`, 11, BODY, 0);
    drawRaw(`${studentName}  ·  第 ${pageIndex} 頁`, 10, MUTED, 0);
    y -= 8;
  };

  const drawRaw = (text: string, size: number, color: ReturnType<typeof rgb>, indent: number) => {
    const safe = sanitizeText(font, normalizeQuestionContentNewlines(text), glyphCache);
    const paragraphs = safe.split("\n");
    for (const paragraph of paragraphs) {
      if (!paragraph) {
        ensureSpace(PARAGRAPH_GAP);
        y -= PARAGRAPH_GAP;
        continue;
      }
      const lines = wrapLine(font, paragraph, size, contentWidth - indent);
      for (const line of lines) {
        ensureSpace(size + 5);
        page.drawText(line, {
          x: MARGIN + indent,
          y: y - size,
          size,
          font,
          color,
        });
        y -= size + 5;
      }
    }
  };

  const title = kind === "answer" ? "GearUp 練習卷（答案）" : "GearUp 練習卷";
  drawRaw(title, 18, BODY, 0);
  drawRaw(`${subjectDisplayLabel(subjectKey)}    ${gradeDisplayLabel(gradeLevel)}`, 13, BODY, 0);
  drawRaw(`學生：${studentName || "—"}`, 11, BODY, 0);
  drawRaw(practicePaperDateLine(), 11, BODY, 0);
  if (kind === "student") {
    drawRaw(`分數：__________ / ${questions.length}`, 11, BODY, 0);
  } else {
    drawRaw("導師參考。請勿派發給學生。", 11, MUTED, 0);
  }
  y -= 8;
  ensureSpace(2);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.6,
    color: MUTED,
  });
  y -= 16;

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    drawRaw(`${index + 1}. ${question.content || ""}`, 11, BODY, 0);
    const imageBytes = images[index];
    if (imageBytes) {
      const embedded = await embedQuestionImage(pdf, imageBytes);
      if (embedded) {
        const maxWidth = 280;
        const scale = Math.min(1, maxWidth / embedded.width, 180 / embedded.height);
        const width = embedded.width * scale;
        const height = embedded.height * scale;
        ensureSpace(height + 8);
        y -= height;
        page.drawImage(embedded, { x: MARGIN + 16, y, width, height });
        y -= 8;
      }
    }
    const choices = practicePaperChoiceLines(question);
    if (choices.length > 0) {
      for (const choice of choices) drawRaw(choice, 11, BODY, 16);
    } else if (kind === "student") {
      drawRaw("答：______________________________", 11, BODY, 16);
    }
    if (kind === "answer") {
      drawRaw(`答案：${formatCorrectAnswer(question)}`, 11, BODY, 16);
      if (question.explanation?.trim()) {
        drawRaw(`解釋：${question.explanation.trim()}`, 10, MUTED, 16);
      }
    }
    y -= 8;
  }

  return pdf.save();
}

function formatCorrectAnswer(question: PracticePaperQuestion): string {
  const answer = question.correct_answer.trim();
  const key = answer.toUpperCase();
  const option =
    key === "A" ? question.opt_a : key === "B" ? question.opt_b : key === "C" ? question.opt_c : key === "D" ? question.opt_d : null;
  if (option?.trim() && (key === "A" || key === "B" || key === "C" || key === "D")) {
    return `${key}. ${option.trim()}`;
  }
  return answer || "—";
}

async function embedQuestionImage(pdf: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  try {
    if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}
