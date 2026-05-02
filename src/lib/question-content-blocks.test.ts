import { describe, expect, it } from "vitest";
import { splitContentIntoParagraphBlocks } from "./question-content-blocks";

describe("splitContentIntoParagraphBlocks", () => {
  it("returns one block when no blank line", () => {
    expect(splitContentIntoParagraphBlocks("第一行\n第二行")).toEqual(["第一行\n第二行"]);
  });

  it("splits on double newline", () => {
    expect(splitContentIntoParagraphBlocks("段落一\n\n段落二")).toEqual(["段落一", "段落二"]);
  });

  it("trims outer whitespace", () => {
    expect(splitContentIntoParagraphBlocks("  A\n\nB  ")).toEqual(["A", "B"]);
  });
});
