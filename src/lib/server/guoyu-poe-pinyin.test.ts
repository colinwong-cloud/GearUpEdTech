import { describe, expect, it, vi } from "vitest";
import {
  parsePoePinyinResponse,
  romanizeChineseLines,
} from "@/lib/server/guoyu-poe-pinyin";
import { alignPinyinToLine } from "@/lib/guoyu/worksheet";

describe("guoyu-poe-pinyin", () => {
  it("parses space-separated syllables matching CJK count", () => {
    expect(parsePoePinyinResponse("nǐ hǎo", 2)).toBe("nǐ hǎo");
    expect(parsePoePinyinResponse("nǐ  hǎo", 2)).toBe("nǐ hǎo");
    expect(parsePoePinyinResponse("nǐ", 2)).toBeNull();
  });

  it("aligns mocked Poe pinyin to characters", () => {
    const line = "你好";
    const romanized = parsePoePinyinResponse("nǐ hǎo", 2)!;
    const cells = alignPinyinToLine(line, romanized);
    expect(cells).toEqual([
      { char: "你", pinyin: "nǐ" },
      { char: "好", pinyin: "hǎo" },
    ]);
  });

  it("returns missingKey when POE_API_KEY is absent", async () => {
    const prev = process.env.POE_API_KEY;
    delete process.env.POE_API_KEY;
    const result = await romanizeChineseLines(["你好"]);
    if (prev) process.env.POE_API_KEY = prev;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingKey).toBe(true);
      expect(result.error).toContain("拼音服務未設定");
    }
  });

  it("romanizes via mocked Poe chat completion", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "nǐ hǎo" } }],
      }),
    })) as unknown as typeof fetch;

    const result = await romanizeChineseLines(["你好"], fetchImpl, "test-key");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lines).toEqual(["nǐ hǎo"]);
    }
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.poe.com/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining("GPT-5.4"),
      })
    );
  });
});
