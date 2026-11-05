import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("guoyu TTS API quota gate", () => {
  it("reads quota before Poe and consumes only after successful TTS", () => {
    const ttsRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/guoyu/tts/route.ts"),
      "utf8"
    );
    const synthIdx = ttsRoute.indexOf("await synthesizeMandarinTts");
    const readIdx = ttsRoute.indexOf("readGuoyuTtsQuota(");
    const consumeIdx = ttsRoute.indexOf("consumeGuoyuTtsQuota(");
    expect(readIdx).toBeGreaterThan(-1);
    expect(synthIdx).toBeGreaterThan(readIdx);
    expect(consumeIdx).toBeGreaterThan(synthIdx);
    expect(ttsRoute).toContain("本月朗讀額度已用完");
  });

  it("ships HOLD SQL for parent TTS usage", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase_guoyu_tts_quota.sql"),
      "utf8"
    );
    expect(sql).toContain("HOLD");
    expect(sql).toContain("parent_guoyu_tts_usage");
    expect(sql).toContain("consume_parent_guoyu_tts_quota");
    expect(sql).toContain("guoyu_ocr_hkt_month_key");
  });
});
