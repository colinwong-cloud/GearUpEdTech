import { describe, expect, it } from "vitest";
import { buildZhongwenXiezuoPdf } from "@/lib/server/zhongwen-xiezuo-pdf";
import type { ZhongwenXiezuoGeneratedContent } from "@/lib/zhongwen-xiezuo/content";

const sample: ZhongwenXiezuoGeneratedContent = {
  version: 1,
  source_phrases: ["晴朗", "微風"],
  page1_cloze: [{ number: 1, sentence_with_blank: "今天天氣天氣＿＿＿。", answer: "晴朗" }],
  page2_cloze: [{ number: 1, sentence_with_blank: "樹葉隨＿＿＿搖動。", answer: "微風" }],
  essay: "今天是個晴朗的日子。",
  rhetoric_marks: [{ device: "誇張", excerpt: "風聲響徹雲霄" }],
};

describe("zhongwen-xiezuo pdf", () => {
  it("builds practice and answer PDFs including 誇張 rhetoric label", async () => {
    const practice = await buildZhongwenXiezuoPdf({
      kind: "practice",
      studentName: "測試",
      content: sample,
    });
    const answer = await buildZhongwenXiezuoPdf({
      kind: "answer",
      studentName: "測試",
      content: sample,
    });
    expect(practice.byteLength).toBeGreaterThan(500);
    expect(answer.byteLength).toBeGreaterThan(500);
    const practiceText = Buffer.from(practice).toString("latin1");
    expect(practiceText.length).toBeGreaterThan(0);
  });
});
