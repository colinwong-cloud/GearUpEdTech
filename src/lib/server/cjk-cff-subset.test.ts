import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { describe, expect, it } from "vitest";
import { installCjkCffSubsetFix } from "./cjk-cff-subset";

const passage = "看到上人立刻信並道歉信楚辭改正方法全班同學練習卷公布";

describe("installCjkCffSubsetFix", () => {
  it("keeps each Traditional Chinese glyph on its own CID font dict and writes a legal CFF offSize", async () => {
    const fontBytes = readFileSync(new URL("./assets/NotoSansTC-subset.otf", import.meta.url));
    installCjkCffSubsetFix(fontBytes);
    const font = fontkit.create(fontBytes) as {
      cff: { fdForGlyph(gid: number): number | null };
      glyphForCodePoint(codePoint: number): { id: number };
      createSubset(): {
        glyphs: number[];
        includeGlyph(glyph: { id: number } | number): number;
        subsetFontdict(topDict: { FDArray: unknown[]; FDSelect?: { fds: number[] } }): void;
        encodeStream(): NodeJS.EventEmitter;
      };
    };
    const subset = font.createSubset();
    for (const character of passage) {
      subset.includeGlyph(font.glyphForCodePoint(character.codePointAt(0)!));
    }

    const topDict: { FDArray: unknown[]; FDSelect?: { fds: number[] } } = { FDArray: [] };
    subset.subsetFontdict(topDict);
    const expected: number[] = [];
    const seen = new Map<number, number>();
    const fdForGlyph = (subset as unknown as { cff: { fdForGlyph(gid: number): number | null } }).cff.fdForGlyph.bind(
      (subset as unknown as { cff: object }).cff
    );
    for (const gid of subset.glyphs) {
      const sourceFd = fdForGlyph(gid);
      if (sourceFd == null) continue;
      let subsetFd = seen.get(sourceFd);
      if (subsetFd === undefined) {
        subsetFd = seen.size;
        seen.set(sourceFd, subsetFd);
      }
      expected.push(subsetFd);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(topDict.FDSelect?.fds).toEqual(expected);

    const cff = await new Promise<Buffer>((resolve, reject) => {
      const parts: Buffer[] = [];
      subset
        .encodeStream()
        .on("data", (chunk: Buffer) => parts.push(chunk))
        .on("end", () => resolve(Buffer.concat(parts)))
        .on("error", reject);
    });
    expect(cff[0]).toBe(1);
    expect(cff[3]).toBe(4);
  });
});
