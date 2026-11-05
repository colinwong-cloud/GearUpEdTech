import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  readGuoyuOcrQuota,
  resolveStudentParent,
} from "@/lib/server/guoyu-ocr-quota";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

type Body = { student_id?: string };

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

  const parentCtx = await resolveStudentParent(admin, studentId);
  if (!parentCtx) {
    return NextResponse.json({ error: "找不到學生帳戶" }, { status: 404 });
  }

  try {
    const quota = await readGuoyuOcrQuota(admin, parentCtx.parentId, parentCtx.mobile);
    return NextResponse.json({ data: quota });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "查詢 OCR 額度失敗" },
      { status: 500 }
    );
  }
}
