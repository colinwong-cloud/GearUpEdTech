import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FEEDBACK_NOTIFY_EMAIL = "colin.wong@hkedutech.com";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      question_id?: string;
      student_id?: string | null;
      session_id?: string | null;
      student_answer?: string | null;
    };

    const questionId = String(body.question_id ?? "").trim();
    if (!questionId || !isUuid(questionId)) {
      return NextResponse.json({ error: "Invalid question_id" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: question, error: questionErr } = await supabase
      .from("questions")
      .select("id,content,correct_answer")
      .eq("id", questionId)
      .maybeSingle();

    if (questionErr) {
      return NextResponse.json(
        { error: "Failed to load question", detail: questionErr.message },
        { status: 500 }
      );
    }
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const studentId = String(body.student_id ?? "").trim() || "N/A";
    const sessionId = String(body.session_id ?? "").trim() || "N/A";
    const studentAnswer = String(body.student_answer ?? "").trim() || "N/A";
    const sentAt = new Date().toLocaleString("zh-HK", {
      hour12: false,
      timeZone: "Asia/Hong_Kong",
    });

    const html = `<!doctype html>
<html lang="zh-Hant">
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <div style="padding:16px 20px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff">
        <h1 style="margin:0;font-size:18px;font-weight:700">GearUp 題目反映通知</h1>
      </div>
      <div style="padding:18px 20px;color:#111827">
        <p style="margin:0 0 12px;font-size:14px;color:#374151">有學生在結果頁按下「反映這題目」。</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr>
            <td style="padding:8px 0;color:#6b7280;width:120px;border-bottom:1px solid #f3f4f6">通知時間</td>
            <td style="padding:8px 0;color:#111827;border-bottom:1px solid #f3f4f6">${escapeHtml(sentAt)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;width:120px;border-bottom:1px solid #f3f4f6">Question ID</td>
            <td style="padding:8px 0;color:#111827;border-bottom:1px solid #f3f4f6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(questionId)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;width:120px;border-bottom:1px solid #f3f4f6">題目內容</td>
            <td style="padding:8px 0;color:#111827;border-bottom:1px solid #f3f4f6">${escapeHtml(String(question.content ?? "N/A"))}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;width:120px;border-bottom:1px solid #f3f4f6">正確答案</td>
            <td style="padding:8px 0;color:#111827;border-bottom:1px solid #f3f4f6">${escapeHtml(String(question.correct_answer ?? "N/A"))}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;width:120px;border-bottom:1px solid #f3f4f6">學生答案</td>
            <td style="padding:8px 0;color:#111827;border-bottom:1px solid #f3f4f6">${escapeHtml(studentAnswer)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;width:120px;border-bottom:1px solid #f3f4f6">Student ID</td>
            <td style="padding:8px 0;color:#111827;border-bottom:1px solid #f3f4f6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(studentId)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;width:120px">Session ID</td>
            <td style="padding:8px 0;color:#111827;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(sessionId)}</td>
          </tr>
        </table>
      </div>
    </div>
  </body>
</html>`;

    const { error: sendErr } = await getResend().emails.send({
      from: "GearUp Quiz <noreply@updates.hkedutech.com>",
      to: FEEDBACK_NOTIFY_EMAIL,
      subject: `題目反映通知：${questionId}`,
      html,
    });
    if (sendErr) {
      return NextResponse.json(
        { error: "Failed to send email", detail: sendErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
