"use client";

import { splitContentIntoParagraphBlocks } from "@/lib/question-content-blocks";

/**
 * Renders question (or passage) text with readable paragraphs.
 * - Single newlines (`\n`): shown as line breaks (`whitespace-pre-line`).
 * - Blank lines (`\n\n` or more): start a new paragraph with spacing.
 * No DB migration: editors can add `\n` / `\n\n` in `questions.content` in Supabase.
 */
export function QuestionContentParagraphs({
  content,
  className,
  paragraphGapClass = "mt-4",
  alignClass = "text-left",
}: {
  content: string;
  className?: string;
  paragraphGapClass?: string;
  /** e.g. text-center for quiz bubble */
  alignClass?: string;
}) {
  const raw = content ?? "";
  const text = raw.trim();
  if (!text) return null;

  const base = `whitespace-pre-line break-words ${alignClass} ${className ?? ""}`.trim();

  const blocks = splitContentIntoParagraphBlocks(raw);

  if (blocks.length <= 1) {
    const single = blocks[0] ?? "";
    if (!single) return null;
    return <div className={base}>{single}</div>;
  }

  return (
    <div className={alignClass}>
      {blocks.map((block, i) => (
        <p key={i} className={`${base} ${i > 0 ? paragraphGapClass : ""}`.trim()}>
          {block}
        </p>
      ))}
    </div>
  );
}
