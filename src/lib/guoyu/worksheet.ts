import { buildCellsWithTonedPinyin } from "@/lib/guoyu/romanize";
import { isCjkCharacter } from "@/lib/guoyu/text";

export type GuoyuCharCell = {
  char: string;
  pinyin: string;
};

export type GuoyuWorksheetRow = {
  cells: GuoyuCharCell[];
  blankPracticeLine: boolean;
};

/** Align romanized syllables (space-separated) to CJK chars in order; punctuation gets empty pinyin. */
export function alignPinyinToLine(line: string, romanized: string): GuoyuCharCell[] {
  const syllables = romanized
    .trim()
    .split(/\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  let syllableIndex = 0;
  const cells: GuoyuCharCell[] = [];
  for (const ch of line) {
    if (isCjkCharacter(ch)) {
      cells.push({ char: ch, pinyin: syllables[syllableIndex] ?? "" });
      syllableIndex += 1;
    } else {
      cells.push({ char: ch, pinyin: "" });
    }
  }
  return cells;
}

export function buildGuoyuWorksheetRows(
  lines: string[],
  romanizedByLine?: string[]
): GuoyuWorksheetRow[] {
  const rows: GuoyuWorksheetRow[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const romanized = romanizedByLine?.[i];
    const cells =
      romanized !== undefined && romanized.trim()
        ? alignPinyinToLine(line, romanized)
        : buildCellsWithTonedPinyin(line);
    rows.push({
      cells,
      blankPracticeLine: true,
    });
  }
  return rows;
}

export const GUOYU_TTS_SPEED_OPTIONS = [
  { value: 0.75, label: "0.75×（慢）" },
  { value: 1.0, label: "1.0×（正常）" },
  { value: 1.25, label: "1.25×（稍快）" },
  { value: 1.5, label: "1.5×（快）" },
  { value: 1.75, label: "1.75×（更快）" },
  { value: 2.0, label: "2.0×（最快）" },
] as const;

export const GUOYU_TTS_DEFAULT_SPEED = 0.75;
