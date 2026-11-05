import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GuoyuComposeScreen layout", () => {
  it("places 返回 after 生成練習 and uses OCR quota circles", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/guoyu/GuoyuComposeScreen.tsx"),
      "utf8"
    );
    const generateIdx = source.indexOf("生成練習");
    const backIdx = source.lastIndexOf("返回");
    expect(generateIdx).toBeGreaterThan(-1);
    expect(backIdx).toBeGreaterThan(generateIdx);
    expect(source).toContain("GuoyuOcrQuotaCircles");
    expect(source).not.toMatch(
      /<h1[\s\S]*返回[\s\S]*生成練習/
    );
  });
});
