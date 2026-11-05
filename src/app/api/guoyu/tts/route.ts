import { NextRequest, NextResponse } from "next/server";
import { synthesizeMandarinTts } from "@/lib/server/guoyu-poe-tts";
import { sanitizeGuoyuInput, hasGuoyuPracticeContent } from "@/lib/guoyu/text";

type Body = {
  text?: string;
  speaking_rate?: number;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sanitized = sanitizeGuoyuInput(String(body.text ?? ""));
  if (!hasGuoyuPracticeContent(sanitized)) {
    return NextResponse.json({ error: "缺少朗讀文字" }, { status: 400 });
  }

  const rateRaw = Number(body.speaking_rate ?? 1);
  const speakingRate = Number.isFinite(rateRaw)
    ? Math.min(2, Math.max(0.75, rateRaw))
    : 1;

  const tts = await synthesizeMandarinTts({
    text: sanitized.replace(/\n/gu, "。"),
    speakingRate,
  });
  if (!tts.ok) {
    return NextResponse.json(
      { error: tts.error, missing_key: tts.missingKey ?? false },
      { status: 503 }
    );
  }

  return NextResponse.json({
    data: {
      audio_base64: tts.audioBase64,
      content_type: tts.contentType,
    },
  });
}
