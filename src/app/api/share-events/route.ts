import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ShareEventPayload = {
  channel?: string;
  action?: string;
  status?: string;
  share_url?: string;
  page_path?: string;
  is_wechat_ua?: boolean;
  metadata?: Record<string, unknown>;
};

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

export async function POST(req: NextRequest) {
  let payload: ShareEventPayload;
  try {
    payload = (await req.json()) as ShareEventPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const channel = (payload.channel || "").trim().toLowerCase();
  const action = (payload.action || "").trim().toLowerCase();
  const status = (payload.status || "").trim().toLowerCase();
  const shareUrl = (payload.share_url || "").trim();

  if (!channel || !action || !status || !shareUrl) {
    return NextResponse.json(
      { error: "channel, action, status and share_url are required" },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, warning: "Supabase service role not configured for share-event logging" },
      { status: 202 }
    );
  }

  const userAgent = req.headers.get("user-agent") || null;
  const forwardedFor = req.headers.get("x-forwarded-for") || null;

  const { error } = await admin.from("social_share_events").insert({
    channel,
    action,
    status,
    share_url: shareUrl,
    page_path: (payload.page_path || "").trim() || null,
    is_wechat_ua: payload.is_wechat_ua === true,
    user_agent: userAgent,
    source_ip: forwardedFor,
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        warning:
          "Unable to write share event. Ensure `social_share_events` table exists in Supabase.",
      },
      { status: 202 }
    );
  }

  return NextResponse.json({ ok: true });
}
