import fontkit from "@pdf-lib/fontkit";

type SubrMap = Record<string, boolean>;

type CffFontDict = {
  FontName?: string;
  Private?: { Subrs?: unknown } | null;
};

type CffSubset = {
  glyphs: number[];
  cff: {
    length: number;
    isCIDFont?: boolean;
    fdForGlyph(gid: number): number | null;
    topDict: { FDArray: CffFontDict[] };
  };
  font: {
    getGlyph(gid: number): { path: unknown; _usedSubrs?: SubrMap };
  };
  subsetSubrs(subrs: unknown, used: SubrMap): unknown;
  subsetFontdict(topDict: { FDArray: CffFontDict[]; FDSelect?: { version: number; fds: number[] } }): void;
  encode(stream: unknown): void;
  __gearupCjkSubsetFixed?: boolean;
};

/**
 * `@pdf-lib/fontkit` 1.1.1 subsets CID-keyed CFF fonts (Noto Sans CJK) incorrectly:
 * the CFF header offSize is written as `cff.length` (40 for this font, outside the
 * spec's 1–4 range), so viewers reject the embedded font, and FDSelect points every
 * glyph at the last Font DICT instead of its own, so local subroutines do not match
 * and Traditional Chinese outlines disappear.
 *
 * Upstream fontkit fixed both (`offSize: 4`, and foliojs/fontkit#230). Apply those
 * two corrections to the subsetter pdf-lib uses.
 */
export function installCjkCffSubsetFix(fontBytes: Uint8Array): void {
  const created = fontkit.create(fontBytes) as { createSubset(): object };
  const proto = Object.getPrototypeOf(created.createSubset()) as CffSubset;
  if (proto.__gearupCjkSubsetFixed) return;
  proto.__gearupCjkSubsetFixed = true;

  proto.subsetFontdict = function subsetFontdict(topDict) {
    topDict.FDArray = [];
    topDict.FDSelect = { version: 0, fds: [] };
    const seen = new Map<number, number>();
    const usedSubrs: SubrMap[] = [];

    for (const gid of this.glyphs) {
      const sourceFd = this.cff.fdForGlyph(gid);
      if (sourceFd == null) continue;
      let subsetFd = seen.get(sourceFd);
      if (subsetFd === undefined) {
        topDict.FDArray.push(Object.assign({}, this.cff.topDict.FDArray[sourceFd]));
        usedSubrs.push({});
        subsetFd = topDict.FDArray.length - 1;
        seen.set(sourceFd, subsetFd);
      }
      topDict.FDSelect.fds.push(subsetFd);
      const glyph = this.font.getGlyph(gid);
      void glyph.path;
      for (const subr in glyph._usedSubrs) {
        usedSubrs[subsetFd][subr] = true;
      }
    }

    for (let index = 0; index < topDict.FDArray.length; index += 1) {
      const dict = topDict.FDArray[index];
      delete dict.FontName;
      if (dict.Private?.Subrs) {
        dict.Private = Object.assign({}, dict.Private, {
          Subrs: this.subsetSubrs(dict.Private.Subrs, usedSubrs[index]),
        });
      }
    }
  };

  const originalEncode = proto.encode;
  proto.encode = function encode(stream: unknown) {
    const previousLength = this.cff.length;
    this.cff.length = 4;
    try {
      return originalEncode.call(this, stream);
    } finally {
      this.cff.length = previousLength;
    }
  };
}
