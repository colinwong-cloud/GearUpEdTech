import { describe, expect, it, vi } from "vitest";
import { extractChineseTextFromImageViaPoe } from "@/lib/server/guoyu-poe-ocr";

describe("guoyu Poe OCR", () => {
  it("returns TC error when POE_API_KEY is missing", async () => {
    const prev = process.env.POE_API_KEY;
    delete process.env.POE_API_KEY;
    const result = await extractChineseTextFromImageViaPoe({
      mimeType: "image/png",
      base64: "abc",
    });
    if (prev) process.env.POE_API_KEY = prev;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingKey).toBe(true);
      expect(result.error).toContain("POE_API_KEY");
    }
  });

  it("strips latin and caps length on mocked success", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "你好 hello 123 世界" } }],
      }),
    })) as unknown as typeof fetch;

    const result = await extractChineseTextFromImageViaPoe({
      mimeType: "image/jpeg",
      base64: "Zm9v",
      apiKey: "test-key",
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("你好 世界");
      expect(result.text).not.toMatch(/hello|[0-9]/);
    }
  });
});
