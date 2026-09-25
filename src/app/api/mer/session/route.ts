import { NextRequest, NextResponse } from "next/server";
import {
  clearMerchantSessionCookie,
  createMerchantSessionToken,
  getMerchantSession,
  setMerchantSessionCookie,
  verifyMerchantLogin,
} from "@/lib/server/merchant-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getMerchantSession(req);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, username: session.sub });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null;
  const username = String(body?.username || "");
  const password = String(body?.password || "");
  if (!verifyMerchantLogin(username, password)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }
  const res = NextResponse.json({ authenticated: true, username });
  setMerchantSessionCookie(res, createMerchantSessionToken());
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ authenticated: false });
  if (getMerchantSession(req)) clearMerchantSessionCookie(res);
  else clearMerchantSessionCookie(res);
  return res;
}
