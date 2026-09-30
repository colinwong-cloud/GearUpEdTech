import { readFileSync } from "fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { subjectDisplayLabel } from "@/lib/quiz-subjects";
import {
  gradeDisplayLabel,
  hktDateLabel,
  practicePaperChoiceLines,
  type PracticePaperQuestion,
} from "@/lib/tutor-practice-paper";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const BODY = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.35, 0.38, 0.42);

let fontBytes: Buffer | null = null;

function loadFontBytes(): Buffer {
  if (!fontBytes) {
    fontBytes = readFileSync(new URL("./assets/NotoSansTC-subset.otf", import.meta.url));
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

export async function buildPracticePaperPdf({
  kind,
  studentName,
  gradeLevel,
  subjectKey,
  createdAt,
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
  const font = await pdf.embedFont(loadFontBytes(), { subset: true });
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
    const safe = sanitizeText(font, text, glyphCache);
    const lines = safe.split("\n").flatMap((line) => wrapLine(font, line, size, contentWidth - indent));
    for (const line of lines) {
      ensureSpace(size + 5);
      page.drawText(line || " ", {
        x: MARGIN + indent,
        y: y - size,
        size,
        font,
        color,
      });
      y -= size + 5;
    }
  };

  const title = kind === "answer" ? "GearUp 練習卷（答案）" : "GearUp 練習卷";
  drawRaw(title, 18, BODY, 0);
  drawRaw(`${subjectDisplayLabel(subjectKey)}    ${gradeDisplayLabel(gradeLevel)}`, 13, BODY, 0);
  drawRaw(`學生：${studentName || "—"}`, 11, BODY, 0);
  drawRaw(`日期：${hktDateLabel(createdAt)}`, 11, BODY, 0);
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
