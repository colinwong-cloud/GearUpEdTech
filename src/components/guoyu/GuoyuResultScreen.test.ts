import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GuoyuResultScreen TTS busy state", () => {
  it("guards double-submit while Poe TTS is in flight", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/guoyu/GuoyuResultScreen.tsx"),
      "utf8"
    );
    expect(source).toContain("ttsInFlightRef");
    expect(source).toContain("setTtsPending(true)");
    expect(source).toContain('startReadAloudLabel = ttsPending ? "處理中" : "開始朗讀"');
    expect(source).toContain("disabled={startReadAloudDisabled}");
    expect(source).toContain("aria-busy={ttsPending}");
  });
});
