import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* Heavy RPC: allow Vercel long enough to wait for PostgREST (monthly can run ~10–60s after SQL fix). */
export const maxDuration = 120;

const ADMIN_U = process.env.ADMIN_CONSOLE_USER || "colinwong";
const ADMIN_P = process.env.ADMIN_CONSOLE_PASS || "qweasd";

export async function POST(req: NextRequest) {
  let b: { user?: string; pass?: string };
  try {
    b = (await req.json()) as { user?: string; pass?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (b.user !== ADMIN_U || b.pass !== ADMIN_P) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel" },
      { status: 503 }
    );
  }
  const admin = createClient(url, key);
  const { data, error } = await admin.rpc("admin_business_monthly");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
