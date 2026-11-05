import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GuoyuResultScreen TTS busy state and quota", () => {
  it("guards double-submit, shows 處理中, and gates on quota", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/guoyu/GuoyuResultScreen.tsx"),
      "utf8"
    );
    expect(source).toContain("ttsInFlightRef");
    expect(source).toContain("setTtsPending(true)");
    expect(source).toContain('startReadAloudLabel = ttsPending ? "處理中" : "開始朗讀"');
    expect(source).toContain("ttsExhausted");
    expect(source).toContain("GuoyuTtsQuotaCircles");
    expect(source).toContain("GUOYU_TTS_DEFAULT_SPEED");
    const controlsIdx = source.indexOf("startReadAloudLabel");
    expect(source.indexOf("GuoyuTtsQuotaCircles", controlsIdx)).toBeGreaterThan(controlsIdx);
  });
});
