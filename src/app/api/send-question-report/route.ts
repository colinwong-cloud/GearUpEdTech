import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

type QuestionReportPayload = {
  student_id?: string | null;
  student_name?: string | null;
  session_id?: string | null;
  question_id?: string | null;
  question_subject?: string | null;
  question_content?: string | null;
  question_explanation?: string | null;
  student_answer?: string | null;
  correct_answer?: string | null;
};

function safeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseNotifyRecipients(): string[] {
  const commaSeparated = process.env.QUESTION_REPORT_NOTIFY_EMAILS?.trim() || "";
  if (commaSeparated) {
    return commaSeparated
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  const single =
    process.env.QUESTION_REPORT_NOTIFY_EMAIL?.trim() ||
    process.env.CS_NOTIFICATION_EMAIL?.trim() ||
    "cs@gearupquiz.com";
  return [single.toLowerCase()];
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as QuestionReportPayload;
    const questionId = safeText(payload.question_id);
    const sessionId = safeText(payload.session_id);
    const studentId = safeText(payload.student_id);
    const studentName = safeText(payload.student_name);

    if (!questionId || !sessionId || !studentId) {
      return NextResponse.json(
        { error: "Missing required report identifiers" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
    if (!resendApiKey) {
      return NextResponse.json({ skipped: true, reason: "no_resend_api_key" });
    }

    const recipients = new Set(parseNotifyRecipients());
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
    if (supabaseUrl && serviceRole) {
      try {
        const admin = createClient(supabaseUrl, serviceRole);
        const { data: studentRow } = await admin
          .from("students")
          .select("student_name,parent:parents(email,parent_name,mobile_number)")
          .eq("id", studentId)
          .maybeSingle();

        const parent = studentRow?.parent as
          | { email?: string | null; parent_name?: string | null; mobile_number?: string | null }
          | null
          | undefined;
        const parentEmail = safeText(parent?.email);
        if (parentEmail) recipients.add(parentEmail.toLowerCase());
      } catch {
        // fall back to default recipients only
      }
    }

    const subject = `【題目反映通知】${studentName || "學生"} 已提交題目反映`;
    const questionSubject = safeText(payload.question_subject) || "—";
    const questionContent = safeText(payload.question_content) || "—";
    const questionExplanation = safeText(payload.question_explanation) || "—";
    const studentAnswer = safeText(payload.student_answer) || "—";
    const correctAnswer = safeText(payload.correct_answer) || "—";

    const html = `<!DOCTYPE html>
<html lang="zh-Hant">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
  <body style="margin:0;padding:20px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
      <h2 style="margin:0 0 12px;color:#1d4ed8;font-size:18px;">題目反映通知</h2>
      <p style="margin:0 0 14px;font-size:14px;color:#374151;">有學生在練習結果頁提交了「反映這題目」。</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;width:140px;">學生名稱</td><td style="padding:6px 0;color:#111827;font-weight:600;">${escapeHtml(studentName || "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">學生 ID</td><td style="padding:6px 0;color:#111827;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(studentId)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Session ID</td><td style="padding:6px 0;color:#111827;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(sessionId)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">題目 ID</td><td style="padding:6px 0;color:#111827;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(questionId)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">科目</td><td style="padding:6px 0;color:#111827;">${escapeHtml(questionSubject)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">學生答案</td><td style="padding:6px 0;color:#b91c1c;font-weight:600;">${escapeHtml(studentAnswer)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">正確答案</td><td style="padding:6px 0;color:#047857;font-weight:600;">${escapeHtml(correctAnswer)}</td></tr>
      </table>
      <div style="margin-top:14px;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280;font-weight:700;">題目內容</p>
        <p style="margin:0;font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap;">${escapeHtml(questionContent)}</p>
      </div>
      <div style="margin-top:10px;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280;font-weight:700;">題目解釋</p>
        <p style="margin:0;font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap;">${escapeHtml(questionExplanation)}</p>
      </div>
    </div>
  </body>
</html>`;

    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: "GearUp Quiz <noreply@updates.hkedutech.com>",
      to: Array.from(recipients),
      subject,
      html,
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to send question report notification", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Internal server error",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 }
    );
  }
}

