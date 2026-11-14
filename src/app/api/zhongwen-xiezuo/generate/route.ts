import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  hasZhongwenXiezuoInput,
  ZHONGWEN_XIEZUO_PHRASE_MIN_COUNT_HINT,
} from "@/lib/zhongwen-xiezuo/content";
import { sanitizeGuoyuInput } from "@/lib/guoyu/text";
import { generateZhongwenXiezuoContent } from "@/lib/server/zhongwen-xiezuo-poe";
import {
  consumeZhongwenXiezuoQuota,
  readZhongwenXiezuoQuota,
  resolveStudentParent,
} from "@/lib/server/zhongwen-xiezuo-quota";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

type Body = { student_id?: string; text?: string };

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

  const text = sanitizeGuoyuInput(String(body.text ?? ""));
  if (!hasZhongwenXiezuoInput(text)) {
    return NextResponse.json({ error: ZHONGWEN_XIEZUO_PHRASE_MIN_COUNT_HINT }, { status: 400 });
  }

  const parentCtx = await resolveStudentParent(admin, studentId);
  if (!parentCtx) {
    return NextResponse.json({ error: "找不到學生帳戶" }, { status: 404 });
  }

  const quotaBefore = await readZhongwenXiezuoQuota(admin, parentCtx.parentId, parentCtx.mobile);
  if (quotaBefore.rpc_ready && quotaBefore.remaining <= 0) {
    return NextResponse.json(
      {
        error: quotaBefore.is_paid_parent
          ? "本月中文寫作額度已用完（每月 10 次）。"
          : "免費中文寫作額度已用完（每月 1 次）。",
        quota: quotaBefore,
      },
      { status: 429 }
    );
  }

  const { data: studentRow } = await admin
    .from("students")
    .select("grade_level")
    .eq("id", studentId)
    .maybeSingle();

  const gen = await generateZhongwenXiezuoContent({
    parentText: text,
    gradeLevel: String(studentRow?.grade_level ?? ""),
  });

  if (!gen.ok) {
    const status = gen.missingKey ? 503 : 502;
    return NextResponse.json({ error: gen.error }, { status });
  }

  if (quotaBefore.rpc_ready) {
    const consumed = await consumeZhongwenXiezuoQuota(admin, parentCtx.parentId, parentCtx.mobile);
    if (!consumed.ok) {
      if (consumed.error === "quota_exhausted") {
        return NextResponse.json(
          {
            error: "本月中文寫作額度已用完。",
            quota: await readZhongwenXiezuoQuota(admin, parentCtx.parentId, parentCtx.mobile),
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: "扣減額度失敗，請稍後再試。" }, { status: 500 });
    }
  }

  const quota = await readZhongwenXiezuoQuota(admin, parentCtx.parentId, parentCtx.mobile);

  return NextResponse.json({
    data: {
      source_text: text,
      content: gen.content,
      quota,
    },
  });
}
