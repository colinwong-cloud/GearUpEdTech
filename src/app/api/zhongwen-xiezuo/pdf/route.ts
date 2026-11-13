import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  parseZhongwenXiezuoContentForPdf,
  zhongwenXiezuoPdfDownloadFilename,
  type ZhongwenXiezuoPdfKind,
} from "@/lib/zhongwen-xiezuo/worksheet-pdf";
import { buildZhongwenXiezuoPdf } from "@/lib/server/zhongwen-xiezuo-pdf";
import { resolveStudentParent } from "@/lib/server/zhongwen-xiezuo-quota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

type Body = {
  student_id?: string;
  kind?: ZhongwenXiezuoPdfKind;
  content?: unknown;
};

function isPdfKind(value: string): value is ZhongwenXiezuoPdfKind {
  return value === "practice" || value === "answer";
}

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

  const kindRaw = String(body.kind ?? "").trim();
  if (!isPdfKind(kindRaw)) {
    return NextResponse.json({ error: "請選擇練習卷或答案卷。" }, { status: 400 });
  }

  const content = parseZhongwenXiezuoContentForPdf(body.content);
  if (!content) {
    return NextResponse.json({ error: "缺少練習內容" }, { status: 400 });
  }

  const parentCtx = await resolveStudentParent(admin, studentId);
  if (!parentCtx) {
    return NextResponse.json({ error: "找不到學生帳戶" }, { status: 404 });
  }

  const { data: studentRow, error: studentErr } = await admin
    .from("students")
    .select("student_name")
    .eq("id", studentId)
    .maybeSingle();
  if (studentErr) {
    return NextResponse.json({ error: "找不到學生帳戶" }, { status: 404 });
  }

  try {
    const pdf = await buildZhongwenXiezuoPdf({
      kind: kindRaw,
      studentName: String(studentRow?.student_name ?? "").trim(),
      content,
    });
    const names = zhongwenXiezuoPdfDownloadFilename({
      studentName: String(studentRow?.student_name ?? "").trim(),
      mobile: parentCtx.mobile,
      kind: kindRaw,
      createdAt: new Date(),
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${names.ascii}"; filename*=UTF-8''${encodeURIComponent(names.unicode)}`,
      },
    });
  } catch (error) {
    console.error("zhongwen xiezuo pdf failed", error);
    const message = error instanceof Error ? error.message : "未能產生 PDF。";
    return NextResponse.json({ error: message || "未能產生 PDF。" }, { status: 500 });
  }
}
