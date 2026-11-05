import { NextRequest, NextResponse } from "next/server";
import { sanitizeGuoyuInput, splitGuoyuLines, hasGuoyuPracticeContent } from "@/lib/guoyu/text";
import { buildGuoyuWorksheetRows } from "@/lib/guoyu/worksheet";
import { romanizeChineseLines } from "@/lib/server/guoyu-google";

type Body = { text?: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sanitized = sanitizeGuoyuInput(String(body.text ?? ""));
  if (!hasGuoyuPracticeContent(sanitized)) {
    return NextResponse.json({ error: "請輸入練習文字" }, { status: 400 });
  }

  const lines = splitGuoyuLines(sanitized).filter((l) => l.trim());
  const romanized = await romanizeChineseLines(lines);
  if (!romanized.ok) {
    return NextResponse.json({ error: romanized.error }, { status: 503 });
  }

  const rows = buildGuoyuWorksheetRows(lines, romanized.lines);
  return NextResponse.json({
    data: {
      source_text: sanitized,
      lines,
      romanized_lines: romanized.lines,
      rows,
    },
  });
}
