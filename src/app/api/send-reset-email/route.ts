import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function buildResetEmailHtml(resetUrl: string, parentName: string | null): string {
  const greeting = parentName ? `${parentName}，你好！` : "你好！";
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:500px;margin:0 auto;padding:24px 16px">
  <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 28px">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">GearUp Quiz</h1>
      <p style="margin:8px 0 0;color:#c7d2fe;font-size:14px">密碼重設</p>
    </div>
    <div style="padding:28px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">${greeting}</p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">
        我們收到了你的密碼重設請求。請點擊以下按鈕設定新密碼。此連結將於 1 小時後失效。
      </p>
      <div style="text-align:center;margin:0 0 24px">
        <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px">
          重設密碼
        </a>
      </div>
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
        如果你沒有要求重設密碼，請忽略此電郵。
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:11px;color:#d1d5db;text-align:center">GearUp Quiz — 由系統自動發送</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const { email, mobile } = await req.json();
    const emailValue = String(email ?? "").trim();
    const mobileValue = String(mobile ?? "").trim();
    if (!mobileValue) {
      return NextResponse.json({ error: "Missing mobile", code: "missing_mobile" }, { status: 400 });
    }
    if (!emailValue) {
      return NextResponse.json({ error: "Missing email", code: "missing_email" }, { status: 400 });
    }

    const { data, error: rpcErr } = await supabase.rpc("create_password_reset", {
      p_mobile: mobileValue,
      p_email: emailValue,
    });
    if (rpcErr) {
      console.error("Reset RPC error:", rpcErr);
      return NextResponse.json({ error: "Server error", detail: rpcErr.message }, { status: 500 });
    }

    const result = data as { found: boolean; reason?: string; token?: string; parent_name?: string };
    if (!result.found) {
      return NextResponse.json({ found: false, reason: result.reason || "email_mismatch" });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured", code: "email_service_not_configured" },
        { status: 500 }
      );
    }

    const host = req.headers.get("host") || "q.hkedutech.com";
    const protocol = host.includes("localhost") ? "http" : "https";
    const resetUrl = `${protocol}://${host}/reset-password?token=${result.token}`;

    const html = buildResetEmailHtml(resetUrl, result.parent_name || null);

    const { error: sendErr } = await getResend().emails.send({
      from: "GearUp Quiz <noreply@updates.hkedutech.com>",
      to: emailValue,
      subject: "GearUp Quiz 密碼重設",
      html,
    });

    if (sendErr) {
      console.error("Resend error:", sendErr);
      return NextResponse.json(
        { error: "Failed to send email", detail: sendErr.message, code: "email_send_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ found: true, sent: true });
  } catch (err) {
    console.error("Reset email catch error:", err);
    return NextResponse.json({ error: "Internal server error", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
