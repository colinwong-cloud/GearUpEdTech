import { NextRequest, NextResponse } from "next/server";
import {
  clearAdminSessionCookie,
  createAdminSessionToken,
  requireAdminSession,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from "@/lib/server/admin-session";

export async function GET(req: NextRequest) {
  const session = requireAdminSession(req);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, user: session.sub });
}

export async function POST(req: NextRequest) {
  let body: { user?: string; pass?: string };
  try {
    body = (await req.json()) as { user?: string; pass?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const user = body.user?.trim() ?? "";
  const pass = body.pass ?? "";
  if (!user || !pass) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    if (!verifyAdminCredentials(user, pass)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json(
      { error: "Admin auth env not configured" },
      { status: 503 }
    );
  }

  const token = createAdminSessionToken(user);
  const res = NextResponse.json({ ok: true });
  setAdminSessionCookie(res, token);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearAdminSessionCookie(res);
  return res;
}
