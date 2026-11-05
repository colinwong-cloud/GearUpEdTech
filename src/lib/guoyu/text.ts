/** Traditional Chinese practice text helpers for 國語練習 */

const LATIN_OR_DIGIT = /[A-Za-z0-9]/;

/** CJK unified + common punctuation / whitespace allowed in the textbox */
export function isAllowedGuoyuChar(ch: string): boolean {
  if (!ch) return false;
  if (/\s/u.test(ch)) return true;
  if (LATIN_OR_DIGIT.test(ch)) return false;
  const code = ch.codePointAt(0)!;
  if (code >= 0x4e00 && code <= 0x9fff) return true;
  if (code >= 0x3400 && code <= 0x4dbf) return true;
  if (code >= 0x20000 && code <= 0x2a6df) return true;
  if (/[，。！？、；：「」『』（）【】《》…—－·．·\u3000-\u303f\ufe30-\ufe4f]/u.test(ch)) {
    return true;
  }
  return false;
}

export function sanitizeGuoyuInput(raw: string): string {
  let out = "";
  for (const ch of raw) {
    if (isAllowedGuoyuChar(ch)) out += ch;
  }
  return out.slice(0, 1000);
}

export function countGuoyuChars(text: string): number {
  return [...text].length;
}

export function hasGuoyuPracticeContent(text: string): boolean {
  return [...text].some((ch) => !/\s/u.test(ch) && isAllowedGuoyuChar(ch));
}

export function stripLatinAndDigits(raw: string): string {
  return raw.replace(/[A-Za-z0-9]/g, "");
}

export function isCjkCharacter(ch: string): boolean {
  if (!ch || /\s/u.test(ch)) return false;
  const code = ch.codePointAt(0)!;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df)
  );
}

export const GUOYU_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export function isAllowedGuoyuImageMime(mime: string): boolean {
  const m = mime.trim().toLowerCase();
  return m === "image/jpeg" || m === "image/png" || m === "image/webp";
}

export function splitGuoyuLines(text: string): string[] {
  return text.split(/\n/u).map((line) => line.trimEnd());
}
