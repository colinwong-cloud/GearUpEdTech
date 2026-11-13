import {
  practicePaperFileStamp,
  practicePaperMobileSuffix,
} from "@/lib/tutor-practice-paper";
import type { ZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";
import { parseZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";

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
    ascii: `gearup-xiezuo-${tail}-${stamp}-${kindAscii}.pdf`,
    unicode: `GearUp-${SUBJECT_LABEL}-${student}-${tail}-${stamp}-${kindLabel}.pdf`,
  };
}

export function parseZhongwenXiezuoContentForPdf(value: unknown): ZhongwenXiezuoGeneratedContent | null {
  return parseZhongwenXiezuoGeneratedContent(value);
}

export function zhongwenXiezuoPdfFontCorpus(content: ZhongwenXiezuoGeneratedContent): string {
  const parts = [
    ...content.source_phrases,
    ...content.page1_cloze.flatMap((c) => [c.sentence_with_blank, c.answer]),
    ...content.page2_cloze.flatMap((c) => [c.sentence_with_blank, c.answer]),
    content.essay,
    ...content.rhetoric_marks.flatMap((m) => [m.device, m.excerpt]),
    "修辭手法誇張詞語庫填空練習範文抄寫",
  ];
  return parts.join("");
}
