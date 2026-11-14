import type { ZhongwenXiezuoRhetoricDevice } from "@/lib/zhongwen-xiezuo/rhetoric";
import { isZhongwenXiezuoRhetoricDevice } from "@/lib/zhongwen-xiezuo/rhetoric";

export type ZhongwenXiezuoClozeItem = {
  number: number;
  sentence_with_blank: string;
  answer: string;
};

export type ZhongwenXiezuoRhetoricMark = {
  device: ZhongwenXiezuoRhetoricDevice | string;
  excerpt: string;
};

export type ZhongwenXiezuoGeneratedContent = {
  version: 1;
  source_phrases: string[];
  page1_cloze: ZhongwenXiezuoClozeItem[];
  page2_cloze: ZhongwenXiezuoClozeItem[];
  essay: string;
  rhetoric_marks: ZhongwenXiezuoRhetoricMark[];
};

const MAX_CLOZE_ITEMS = 12;
const MAX_ESSAY_CHARS = 1200;

/** Owner copy: delimiter guidance for parent phrase input (Traditional Chinese). */
export const ZHONGWEN_XIEZUO_PHRASE_DELIMITER_HINT =
  "請以換行、逗號、頓號或空格分隔多個詞語。";

export const ZHONGWEN_XIEZUO_PHRASE_MIN_COUNT_HINT =
  "請至少輸入兩個詞語（以換行、逗號、頓號或空格分隔）。";

export function parseParentPhraseInput(raw: string): string[] {
  const parts = raw
    .split(/[\n,，、;；\s\u3000]+/u)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= 40) break;
  }
  return out;
}

export function hasZhongwenXiezuoInput(raw: string): boolean {
  return parseParentPhraseInput(raw).length >= 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClozeList(value: unknown): ZhongwenXiezuoClozeItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CLOZE_ITEMS) return null;
  const items: ZhongwenXiezuoClozeItem[] = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const number = Number(row.number);
    const sentence_with_blank = String(row.sentence_with_blank ?? "").trim();
    const answer = String(row.answer ?? "").trim();
    if (!Number.isFinite(number) || !sentence_with_blank || !answer) return null;
    items.push({ number, sentence_with_blank, answer });
  }
  return items;
}

export function parseZhongwenXiezuoGeneratedContent(value: unknown): ZhongwenXiezuoGeneratedContent | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  const source_phrases = Array.isArray(value.source_phrases)
    ? value.source_phrases.map((p) => String(p).trim()).filter(Boolean)
    : null;
  if (!source_phrases || source_phrases.length < 2) return null;
  const page1_cloze = parseClozeList(value.page1_cloze);
  const page2_cloze = parseClozeList(value.page2_cloze);
  if (!page1_cloze || !page2_cloze) return null;
  const essay = String(value.essay ?? "").trim();
  if (!essay || essay.length > MAX_ESSAY_CHARS) return null;
  const rhetoric_marks: ZhongwenXiezuoRhetoricMark[] = [];
  if (Array.isArray(value.rhetoric_marks)) {
    for (const row of value.rhetoric_marks) {
      if (!isRecord(row)) continue;
      const device = String(row.device ?? "").trim();
      const excerpt = String(row.excerpt ?? "").trim();
      if (!device || !excerpt) continue;
      rhetoric_marks.push({
        device: isZhongwenXiezuoRhetoricDevice(device) ? device : device,
        excerpt,
      });
    }
  }
  return {
    version: 1,
    source_phrases,
    page1_cloze,
    page2_cloze,
    essay,
    rhetoric_marks,
  };
}

export function gradeLevelWritingHint(gradeLevel: string): string {
  const g = String(gradeLevel ?? "").trim().toUpperCase();
  if (/^P[1-2]/.test(g) || /小一|小二/.test(gradeLevel)) {
    return "小一至小二：句子較短、詞彙淺白，故事簡單清楚。";
  }
  if (/^P[3-4]/.test(g) || /小三|小四/.test(gradeLevel)) {
    return "小三至小四：段落清楚，可加入簡單描寫與對話。";
  }
  return "小五至小六：結構完整，可運用較豐富的修辭與情節發展。";
}
