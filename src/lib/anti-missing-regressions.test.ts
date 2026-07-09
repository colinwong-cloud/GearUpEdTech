import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("anti-missing regression guards", () => {
  it("keeps results page wrong-answer details and action buttons", () => {
    const pageSource = readSource("src/app/page.tsx");
    expect(pageSource).toContain("錯題解析");
    expect(pageSource).toContain("你的答案（值）");
    expect(pageSource).toContain("正確答案（值）");
    expect(pageSource).toContain("再做一次");
    expect(pageSource).toContain("回到主畫面");
    expect(pageSource).toContain("bg-orange-500 text-white");
    expect(pageSource).toContain("登出");
  });

  it("keeps parent practice email readability markers", () => {
    const emailSource = readSource("src/app/api/send-quiz-email/route.ts");
    expect(emailSource).toContain('meta name="color-scheme" content="light"');
    expect(emailSource).toContain("老師給家長的練習小結");
    expect(emailSource).toContain("font-size:16px;color:#111827;line-height:1.75");
    expect(emailSource).toContain("Keep up the great work! 繼續加油！ 💪");
  });
});

