import { pinyin } from "pinyin-pro";
import { isCjkCharacter } from "@/lib/guoyu/text";
import type { GuoyuCharCell } from "@/lib/guoyu/worksheet";

/** Hanyu Pinyin tone-mark vowels for PDF font subsetting and validation. */
export const GUOYU_PINYIN_TONE_MARKS =
  "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ";

const TONE_MARK_RE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u;

export function syllableHasToneMark(syllable: string): boolean {
  return TONE_MARK_RE.test(syllable);
}

/** Per-character Mandarin Hanyu Pinyin with tone diacritics (written-character reading). */
export function buildCellsWithTonedPinyin(line: string): GuoyuCharCell[] {
  const tokens = pinyin(line, { toneType: "symbol", type: "array" });
  const chars = [...line];
  return chars.map((ch, index) => ({
    char: ch,
    pinyin: isCjkCharacter(ch) ? String(tokens[index] ?? "").trim() : "",
  }));
}

export function romanizedLineFromCells(cells: GuoyuCharCell[]): string {
  return cells
    .filter((cell) => isCjkCharacter(cell.char))
    .map((cell) => cell.pinyin)
    .filter(Boolean)
    .join(" ");
}

export function romanizeGuoyuLines(lines: string[]): string[] {
  return lines.map((line) => romanizedLineFromCells(buildCellsWithTonedPinyin(line)));
}
