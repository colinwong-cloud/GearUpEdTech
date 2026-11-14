import {
  practicePaperFileStamp,
  practicePaperMobileSuffix,
} from "@/lib/tutor-practice-paper";
import type { ZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";
import { parseZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";
import {
  ZHONGWEN_XIEZUO_RHETORIC_DEVICES,
  ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL,
} from "@/lib/zhongwen-xiezuo/rhetoric";

export type ZhongwenXiezuoPdfKind = "practice" | "answer";

const SUBJECT_LABEL = "中文寫作";

function safeDownloadSegment(value: string, fallback: string): string {
  const cleaned = String(value ?? "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "")
    .trim();
  return cleaned || fallback;
}

export function zhongwenXiezuoPdfDownloadFilename(input: {
  studentName: string;
  mobile: string;
  kind: ZhongwenXiezuoPdfKind;
  createdAt: Date;
}): { ascii: string; unicode: string } {
  const stamp = practicePaperFileStamp(input.createdAt);
  const tail = practicePaperMobileSuffix(input.mobile);
  const kindAscii = input.kind === "answer" ? "answer" : "practice";
  const kindLabel = input.kind === "answer" ? "答案卷" : "學生練習卷";
  const student = safeDownloadSegment(input.studentName, "學生");
  return {
    ascii: `zengfenbao-xiezuo-${tail}-${stamp}-${kindAscii}.pdf`,
    unicode: `增分寶-${SUBJECT_LABEL}-${student}-${tail}-${stamp}-${kindLabel}.pdf`,
  };
}

export function parseZhongwenXiezuoContentForPdf(value: unknown): ZhongwenXiezuoGeneratedContent | null {
  return parseZhongwenXiezuoGeneratedContent(value);
}

/** Ruled-line spacing for student 抄寫 band (PDF units); was 28 before Soft #256. */
export const ZHONGWEN_XIEZUO_COPY_RULED_LINE_SPACING = 56;

/** Every static label on 學生練習卷 and 家長答案卷 must appear here so subset-font retains glyphs. */
export const ZHONGWEN_XIEZUO_PDF_STATIC_LABELS = [
  "增分寶 中文寫作 · 答案卷（家長）",
  "增分寶 中文寫作 · 學生練習卷",
  "學生：—",
  "日期：________________",
  "家長參考。標示修辭手法（含誇張等）。",
  "第一頁：選詞填空（詞語庫）",
  "第二頁：選詞填空（無詞語庫）",
  "第三頁：範文（請抄寫）",
  "詞語庫：",
  "抄寫區（橫線）：",
  `修辭手法（${ZHONGWEN_XIEZUO_RHETORIC_LIST_LABEL}）`,
  ...ZHONGWEN_XIEZUO_RHETORIC_DEVICES,
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  "，。？！、；：「」『』（）【】《》〈〉—…．·×÷＿_　／",
].join("");

export function zhongwenXiezuoPdfFontCorpus(content: ZhongwenXiezuoGeneratedContent): string {
  const chunks = [
    ZHONGWEN_XIEZUO_PDF_STATIC_LABELS,
    ...content.source_phrases,
    ...content.page1_cloze.flatMap((c) => [c.sentence_with_blank, c.answer]),
    ...content.page2_cloze.flatMap((c) => [c.sentence_with_blank, c.answer]),
    content.essay,
    ...content.rhetoric_marks.flatMap((m) => [m.device, m.excerpt]),
  ];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    for (const character of chunk) {
      if (character === "\n" || character === "\r" || character === "\t") continue;
      seen.add(character);
    }
  }
  return Array.from(seen).join("");
}
