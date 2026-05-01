/**
 * Decode .txt from Supabase that may be UTF-8 or Big5 (Traditional Chinese).
 */
export function decodeTraditionalChineseText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const utfBad = (utf8.match(/\uFFFD/g) || []).length;

  if (typeof TextDecoder !== "undefined") {
    try {
      const big5Dec = new TextDecoder("big5");
      const big5 = big5Dec.decode(buffer);
      const big5Bad = (big5.match(/\uFFFD/g) || []).length;
      if (big5Bad < utfBad || (utfBad > 0 && big5Bad === 0)) return big5;
    } catch {
      /* Big5 not supported in this engine — keep UTF-8 */
    }
  }

  return utf8;
}
