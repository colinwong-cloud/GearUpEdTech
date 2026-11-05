import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAllowedGuoyuImageMime } from "@/lib/guoyu/text";
import { extractChineseTextFromImageViaPoe } from "@/lib/server/guoyu-poe-ocr";
import {
  consumeGuoyuOcrQuota,
  readGuoyuOcrQuota,
  resolveStudentParent,
} from "@/lib/server/guoyu-ocr-quota";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

type Body = {
  student_id?: string;
  mime_type?: string;
  image_base64?: string;
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
  const mime = String(body.mime_type ?? "").trim().toLowerCase();
  const base64 = String(body.image_base64 ?? "").trim();

  if (!studentId) {
    return NextResponse.json({ error: "缺少 student_id" }, { status: 400 });
  }
  if (!base64) {
    return NextResponse.json({ error: "請上傳圖片" }, { status: 400 });
  }
  if (!isAllowedGuoyuImageMime(mime)) {
    return NextResponse.json(
      { error: "只接受 JPG、PNG、WebP，不支援 PDF 或 Word。" },
      { status: 400 }
    );
  }

  const parentCtx = await resolveStudentParent(admin, studentId);
  if (!parentCtx) {
    return NextResponse.json({ error: "找不到學生帳戶" }, { status: 404 });
  }

  let quota;
  try {
    quota = await readGuoyuOcrQuota(admin, parentCtx.parentId, parentCtx.mobile);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "查詢 OCR 額度失敗" },
      { status: 500 }
    );
  }

  if (quota.rpc_ready && quota.remaining <= 0) {
    return NextResponse.json(
      { error: "OCR 額度已用完", quota },
      { status: 429 }
    );
  }

  const ocr = await extractChineseTextFromImageViaPoe({
    mimeType: mime,
    base64,
  });
  if (!ocr.ok) {
    return NextResponse.json(
      { error: ocr.error, missing_key: ocr.missingKey ?? false },
      { status: ocr.missingKey ? 503 : 422 }
    );
  }

  if (quota.rpc_ready) {
    const consumed = await consumeGuoyuOcrQuota(
      admin,
      parentCtx.parentId,
      parentCtx.mobile
    );
    if (!consumed.ok) {
      return NextResponse.json(
        {
          error: "OCR 額度已用完",
          quota: {
            ...quota,
            remaining: consumed.remaining,
            cap: consumed.cap,
            is_paid_parent: consumed.is_paid_parent,
            is_tutor_parent: consumed.is_tutor_parent,
          },
        },
        { status: 429 }
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
      text: ocr.text,
      quota,
    },
  });
}
