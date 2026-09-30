import { NextRequest, NextResponse } from "next/server";
import { registerTutor } from "@/lib/server/tutor-self-register";

type RegisterBody = {
  tutor_name?: string;
  tutor_mobile?: string;
  tutor_email?: string;
  turnstile_token?: string;
};

export async function POST(req: NextRequest) {
  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const remoteIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    const result = await registerTutor({
      tutorName: String(body.tutor_name ?? ""),
      tutorMobile: String(body.tutor_mobile ?? ""),
      tutorEmail: String(body.tutor_email ?? ""),
      turnstileToken: String(body.turnstile_token ?? ""),
      remoteIp,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      code: result.code,
      temporary_password: result.temporaryPassword,
      email_sent: result.emailSent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "登記失敗。";
    return NextResponse.json({ error: message || "登記失敗。" }, { status: 500 });
  }
}
