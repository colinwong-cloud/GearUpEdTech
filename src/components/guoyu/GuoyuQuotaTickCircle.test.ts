import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GuoyuQuotaTickCircle", () => {
  it("uses lime fill and white tick for used quota", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/guoyu/GuoyuQuotaTickCircle.tsx"),
      "utf8"
    );
    expect(source).toContain("#84cc16");
    expect(source).toContain('stroke="#ffffff"');
    expect(source).toContain('stroke="#000000"');
  });
});
