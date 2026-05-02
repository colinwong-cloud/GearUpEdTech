/**
 * Normalize line endings and escaped newlines from editors / JSON (`\\n` in storage).
 */
export function normalizeQuestionContentNewlines(text: string): string {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n");
}

/**
 * Split question/passage text on blank lines (paragraph breaks).
 * Single `\n` is preserved in each block for `whitespace-pre-line` rendering.
 */
export function splitContentIntoParagraphBlocks(text: string): string[] {
  const normalized = normalizeQuestionContentNewlines(text);
  return normalized
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}
