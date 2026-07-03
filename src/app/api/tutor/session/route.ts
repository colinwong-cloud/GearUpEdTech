import { NextRequest, NextResponse } from "next/server";
import {
  changeTutorPassword,
  clearTutorSessionCookie,
  getTutorSession,
  loginTutor,
  setTutorSessionCookie,
} from "@/lib/server/tutor-session";

function sanitizeCode(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);
}

export async function GET(req: NextRequest) {
  const session = await getTutorSession(req);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    code: session.code,
    tutor_name: session.tutorName,
    must_change_password: session.mustChangePassword,
  });
}

export async function POST(req: NextRequest) {
  let body: { code?: string; password?: string };
  try {
    body = (await req.json()) as { code?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = sanitizeCode(body.code);
  const password = String(body.password ?? "");
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "請輸入 6 位數字教師編號。" }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "請輸入密碼。" }, { status: 400 });
  }

  let result:
    | {
        ok: true;
        token: string;
        code: string;
        mustChangePassword: boolean;
      }
    | {
        ok: false;
        status: number;
        error: string;
        lockedUntil?: string | null;
      };
  try {
    result = await loginTutor({ code, password });
  } catch (err) {
    const message = err instanceof Error ? err.message : "登入流程失敗。";
    if (/tutor_portal_accounts|does not exist|42P01/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "缺少導師入口資料表，請先在 Supabase 執行 supabase_tutor_portal_auth.sql。",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        locked_until: result.lockedUntil ?? null,
      },
      { status: result.status }
    );
  }

  const res = NextResponse.json({
    ok: true,
    code: result.code,
    must_change_password: result.mustChangePassword,
  });
  setTutorSessionCookie(res, result.token);
  return res;
}

export async function PATCH(req: NextRequest) {
  let body: { current_password?: string; new_password?: string; confirm_password?: string };
  try {
    body = (await req.json()) as {
      current_password?: string;
      new_password?: string;
      confirm_password?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentPassword = String(body.current_password ?? "");
  const newPassword = String(body.new_password ?? "");
  const confirmPassword = String(body.confirm_password ?? "");
  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json({ error: "請完整填寫密碼欄位。" }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "新密碼與確認密碼不一致。" }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "新密碼不可與目前密碼相同。" }, { status: 400 });
  }

  let result:
    | {
        ok: true;
      }
    | {
        ok: false;
        status: number;
        error: string;
      };
  try {
    result = await changeTutorPassword({
      req,
      currentPassword,
      newPassword,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新密碼失敗。";
    if (/tutor_portal_accounts|does not exist|42P01/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "缺少導師入口資料表，請先在 Supabase 執行 supabase_tutor_portal_auth.sql。",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, must_change_password: false });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearTutorSessionCookie(res);
  return res;
}
