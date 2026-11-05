import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeGuoyuInput, hasGuoyuPracticeContent } from "@/lib/guoyu/text";
import { synthesizeMandarinTts } from "@/lib/server/guoyu-poe-tts";
import {
  consumeGuoyuTtsQuota,
  readGuoyuTtsQuota,
  resolveStudentParent,
} from "@/lib/server/guoyu-tts-quota";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

type Body = {
  student_id?: string;
  text?: string;
  speaking_rate?: number;
};

export async function POST(req: NextRequest) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "服務暫不可用" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const studentId = String(body.student_id ?? "").trim();
  if (!studentId) {
    return NextResponse.json({ error: "缺少 student_id" }, { status: 400 });
  }

  const sanitized = sanitizeGuoyuInput(String(body.text ?? ""));
  if (!hasGuoyuPracticeContent(sanitized)) {
    return NextResponse.json({ error: "缺少朗讀文字" }, { status: 400 });
  }

  const parentCtx = await resolveStudentParent(admin, studentId);
  if (!parentCtx) {
    return NextResponse.json({ error: "找不到學生帳戶" }, { status: 404 });
  }

  let quota;
  try {
    quota = await readGuoyuTtsQuota(admin, parentCtx.parentId, parentCtx.mobile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "查詢朗讀額度失敗" },
      { status: 500 }
    );
  }

  if (quota.rpc_ready && quota.remaining <= 0) {
    return NextResponse.json(
      { error: "本月朗讀額度已用完", quota },
      { status: 429 }
    );
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

  if (quota.rpc_ready) {
    const consumed = await consumeGuoyuTtsQuota(
      admin,
      parentCtx.parentId,
      parentCtx.mobile
    );
    if (!consumed.ok) {
      const exhausted = consumed.error === "quota_exhausted";
      return NextResponse.json(
        {
          error: exhausted ? "本月朗讀額度已用完" : "朗讀額度更新失敗",
          quota: {
            ...quota,
            remaining: consumed.remaining,
            cap: consumed.cap,
            is_paid_parent: consumed.is_paid_parent,
            is_tutor_parent: consumed.is_tutor_parent,
          },
        },
        { status: exhausted ? 429 : 503 }
      );
    }
    quota = {
      ...quota,
      remaining: consumed.remaining,
      cap: consumed.cap,
      is_paid_parent: consumed.is_paid_parent,
      is_tutor_parent: consumed.is_tutor_parent,
      usage_count: consumed.cap - consumed.remaining,
    };
  }

  return NextResponse.json({
    data: {
      audio_base64: tts.audioBase64,
      content_type: tts.contentType,
      quota,
    },
  });
}
