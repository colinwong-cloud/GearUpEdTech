import { describe, expect, it, vi } from "vitest";
import {
  bestEffortPoePinyinLine,
  maxTokensForPinyinLine,
  parsePoePinyinResponse,
  romanizeChineseLines,
  romanizePinyinLineWithPoe,
} from "@/lib/server/guoyu-poe-pinyin";
import { alignPinyinToLine, buildGuoyuWorksheetRows } from "@/lib/guoyu/worksheet";

describe("guoyu-poe-pinyin", () => {
  it("parses space-separated syllables matching CJK count", () => {
    expect(parsePoePinyinResponse("nǐ hǎo", 2)).toBe("nǐ hǎo");
    expect(parsePoePinyinResponse("nǐ  hǎo", 2)).toBe("nǐ hǎo");
    expect(parsePoePinyinResponse("nǐ", 2)).toBeNull();
  });

  it("best-effort accepts syllable count drift", () => {
    expect(bestEffortPoePinyinLine("nǐ hǎo shì")).toBe("nǐ hǎo shì");
    const line = "你好世";
    const romanized = bestEffortPoePinyinLine("nǐ hǎo")!;
    const cells = alignPinyinToLine(line, romanized);
    expect(cells[2]?.pinyin).toBe("");
  });

  it("scales max_tokens for long lines", () => {
    expect(maxTokensForPinyinLine(10)).toBe(800);
    expect(maxTokensForPinyinLine(150)).toBeGreaterThan(800);
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

  it("retries on count mismatch then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "nǐ" } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "nǐ hǎo" } }],
        }),
      }) as unknown as typeof fetch;

    const result = await romanizePinyinLineWithPoe("你好", fetchImpl, "test-key");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.romanized).toBe("nǐ hǎo");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("accepts best-effort after retry still mismatches", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "nǐ hǎo shì" } }],
      }),
    })) as unknown as typeof fetch;

    const line = "你好世界";
    const result = await romanizePinyinLineWithPoe(line, fetchImpl, "test-key");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rows = buildGuoyuWorksheetRows([line], [result.romanized]);
      expect(rows[0]?.cells).toHaveLength(4);
      expect(rows[0]?.cells[0]?.pinyin).toBe("nǐ");
      expect(rows[0]?.cells[3]?.pinyin).toBe("");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails on Poe HTTP error without best-effort fallback", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const result = await romanizePinyinLineWithPoe("你好", fetchImpl, "test-key");
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
