import {
  practicePaperFileStamp,
  practicePaperMobileSuffix,
} from "@/lib/tutor-practice-paper";
import type { GuoyuWorksheetRow } from "@/lib/guoyu/worksheet";
import { GUOYU_PINYIN_TONE_MARKS } from "@/lib/guoyu/romanize";
import { isCjkCharacter } from "@/lib/guoyu/text";

export type GuoyuWorksheetPdfKind = "practice" | "answer";

const GUOYU_SUBJECT_LABEL = "國語練習";

function safeDownloadSegment(value: string, fallback: string): string {
  const cleaned = String(value ?? "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "")
    .trim();
  return cleaned || fallback;
}

export function guoyuWorksheetPdfDownloadFilename(input: {
  studentName: string;
  mobile: string;
  kind: GuoyuWorksheetPdfKind;
  createdAt: Date;
}): { ascii: string; unicode: string } {
  const stamp = practicePaperFileStamp(input.createdAt);
  const tail = practicePaperMobileSuffix(input.mobile);
  const kindAscii = input.kind === "answer" ? "answer" : "practice";
  const kindLabel = input.kind === "answer" ? "答案卷" : "練習卷（空白拼音）";
  const student = safeDownloadSegment(input.studentName, "學生");
  return {
    ascii: `gearup-guoyu-${tail}-${stamp}-${kindAscii}.pdf`,
    unicode: `GearUp-${GUOYU_SUBJECT_LABEL}-${student}-${tail}-${stamp}-${kindLabel}.pdf`,
  };
}

export function guoyuWorksheetPdfKindLabel(kind: GuoyuWorksheetPdfKind): string {
  return kind === "answer" ? "答案卷" : "練習卷（空白拼音）";
}

const MAX_GUOYU_PDF_ROWS = 120;
const MAX_GUOYU_PDF_CELLS = 4000;

export function parseGuoyuWorksheetRowsForPdf(value: unknown): GuoyuWorksheetRow[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_GUOYU_PDF_ROWS) {
    return null;
  }
  let cellCount = 0;
  const rows: GuoyuWorksheetRow[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const cellsRaw = (row as { cells?: unknown }).cells;
    if (!Array.isArray(cellsRaw) || cellsRaw.length === 0) return null;
    const cells = [];
    for (const cell of cellsRaw) {
      if (!cell || typeof cell !== "object") return null;
      const ch = String((cell as { char?: unknown }).char ?? "");
      const pinyin = String((cell as { pinyin?: unknown }).pinyin ?? "");
      if (ch.length === 0 || ch.length > 8) return null;
      if (pinyin.length > 32) return null;
      cells.push({ char: ch, pinyin });
      cellCount += 1;
      if (cellCount > MAX_GUOYU_PDF_CELLS) return null;
    }
    rows.push({
      cells,
      blankPracticeLine: Boolean((row as { blankPracticeLine?: unknown }).blankPracticeLine),
    });
  }
  return rows;
}

export function guoyuWorksheetPdfFontCorpus(rows: GuoyuWorksheetRow[]): string {
  const chunks = [
    "拼音練習 GearUp 國語練習 練習卷（空白拼音） 答案卷 範例 日期：________________ 導師參考。請勿派發給學生。",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    GUOYU_PINYIN_TONE_MARKS,
    "，。？！、；：「」『』（）【】《》〈〉—…．·×÷＿_　／",
  ];
  for (const row of rows) {
    for (const cell of row.cells) {
      chunks.push(cell.char, cell.pinyin);
    }
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

export function guoyuWorksheetBlankPinyinDisplay(char: string): string {
  if (!isCjkCharacter(char)) return "·";
  return "＿＿";
}
