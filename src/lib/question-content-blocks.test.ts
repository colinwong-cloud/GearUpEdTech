import { describe, expect, it } from "vitest";
import {
  normalizeQuestionContentNewlines,
  splitContentIntoParagraphBlocks,
} from "./question-content-blocks";

describe("normalizeQuestionContentNewlines", () => {
  it("converts CRLF to LF", () => {
    expect(normalizeQuestionContentNewlines("a\r\nb")).toBe("a\nb");
  });

  it("expands literal backslash-n sequences", () => {
    expect(normalizeQuestionContentNewlines("段落一\\n\\n段落二")).toBe("段落一\n\n段落二");
  });
});

describe("splitContentIntoParagraphBlocks", () => {
  it("returns one block when no blank line", () => {
    expect(splitContentIntoParagraphBlocks("第一行\n第二行")).toEqual(["第一行\n第二行"]);
  });

  it("splits on double newline", () => {
    expect(splitContentIntoParagraphBlocks("段落一\n\n段落二")).toEqual(["段落一", "段落二"]);
  });

  it("splits when blank line is stored as escaped newlines", () => {
    expect(splitContentIntoParagraphBlocks("段落一\\n\\n段落二")).toEqual(["段落一", "段落二"]);
  });

  it("trims outer whitespace", () => {
    expect(splitContentIntoParagraphBlocks("  A\n\nB  ")).toEqual(["A", "B"]);
  });
});
