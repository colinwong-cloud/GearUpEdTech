import { describe, expect, it } from "vitest";
import { decodeTraditionalChineseText } from "./decode-traditional-chinese-text";

describe("decodeTraditionalChineseText", () => {
  it("decodes UTF-8 text", () => {
    const buf = new TextEncoder().encode("你好\n第二行");
    expect(decodeTraditionalChineseText(buf.buffer)).toBe("你好\n第二行");
  });
});
