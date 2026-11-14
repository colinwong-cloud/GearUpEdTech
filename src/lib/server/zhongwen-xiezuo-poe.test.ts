import { describe, expect, it } from "vitest";
import { generateZhongwenXiezuoContent } from "@/lib/server/zhongwen-xiezuo-poe";

describe("zhongwen-xiezuo-poe", () => {
  it("parses mocked Poe JSON and normalizes 夸張 → 誇張 in rhetoric marks", async () => {
    const mockJson = {
      version: 1,
      source_phrases: ["晴朗", "微風"],
      page1_cloze: [{ number: 1, sentence_with_blank: "今天天氣天氣＿＿＿。", answer: "晴朗" }],
      page2_cloze: [{ number: 1, sentence_with_blank: "樹葉隨樹葉隨＿＿＿搖動。", answer: "微風" }],
      essay: "今天是個晴朗的日子，微風輕輕吹過，像母親的手撫過臉龐。",
      rhetoric_marks: [{ device: "夸張", excerpt: "風聲響徹雲霄" }],
    };

    let capturedUser = "";
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role: string; content: string }>;
      };
      capturedUser = body.messages?.find((m) => m.role === "user")?.content ?? "";
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockJson) } }],
        }),
      } as Response;
    };

    const result = await generateZhongwenXiezuoContent({
      parentText: "晴朗\n微風",
      gradeLevel: "P4",
      fetchImpl,
      apiKey: "test-key",
    });

    expect(capturedUser).toContain("編號僅供盤點");
    expect(capturedUser).toContain("勿視為範文或填空的出現順序");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.rhetoric_marks[0]?.device).toBe("誇張");
      expect(result.content.rhetoric_marks[0]?.device).not.toBe("夸張");
    }
  });
});
