/**
 * Split question/passage text on blank lines (paragraph breaks).
 * Single `\n` is preserved in each block for `whitespace-pre-line` rendering.
 */
export function splitContentIntoParagraphBlocks(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}
