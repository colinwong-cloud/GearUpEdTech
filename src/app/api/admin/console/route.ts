import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";

type AdminAction =
  | "search_parent"
  | "add_quota"
  | "delete_parent"
  | "get_settings"
  | "set_setting"
  | "set_email_notification"
  | "search_questions"
  | "update_question";

type RequestBody = {
  action?: AdminAction;
  payload?: Record<string, unknown>;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel" },
      { status: 503 }
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  const payload = body.payload ?? {};
  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  try {
    switch (action) {
      case "search_parent": {
        const mobile = String(payload.p_mobile ?? "");
        const { data, error } = await admin.rpc("admin_search_parent", {
          p_mobile: mobile,
        });
        if (error) throw error;
        return NextResponse.json({ data: data ?? null });
      }
      case "add_quota": {
        const studentId = String(payload.p_student_id ?? "");
        const subject = String(payload.p_subject ?? "Math");
        const amount = Number(payload.p_amount ?? 0);
        const { data, error } = await admin.rpc("admin_add_quota", {
          p_student_id: studentId,
          p_subject: subject,
          p_amount: amount,
        });
        if (error) throw error;
        return NextResponse.json({ data });
      }
      case "delete_parent": {
        const mobile = String(payload.p_mobile ?? "");
        const { data, error } = await admin.rpc("admin_delete_parent", {
          p_mobile: mobile,
        });
        if (error) throw error;
        return NextResponse.json({ data });
      }
      case "get_settings": {
        const { data, error } = await admin.rpc("admin_get_settings");
        if (error) throw error;
        return NextResponse.json({ data: data ?? {} });
      }
      case "set_setting": {
        const key = String(payload.p_key ?? "");
        const value = String(payload.p_value ?? "");
        const { error } = await admin.rpc("admin_set_setting", {
          p_key: key,
          p_value: value,
        });
        if (error) throw error;
        return NextResponse.json({ data: { ok: true } });
      }
      case "set_email_notification": {
        const email = String(payload.p_email ?? "");
        const enabled = Boolean(payload.p_enabled);
        const { data, error } = await admin.rpc("admin_set_email_notification", {
          p_email: email,
          p_enabled: enabled,
        });
        if (error) throw error;
        return NextResponse.json({ data });
      }
      case "search_questions": {
        const query = String(payload.p_query ?? "");
        const { data, error } = await admin.rpc("admin_search_questions", {
          p_query: query,
        });
        if (error) throw error;
        return NextResponse.json({ data: data ?? [] });
      }
      case "update_question": {
        const { error } = await admin.rpc("admin_update_question", {
          p_id: String(payload.p_id ?? ""),
          p_content: payload.p_content,
          p_opt_a: payload.p_opt_a,
          p_opt_b: payload.p_opt_b,
          p_opt_c: payload.p_opt_c,
          p_opt_d: payload.p_opt_d,
          p_correct_answer: payload.p_correct_answer,
          p_explanation: payload.p_explanation,
        });
        if (error) throw error;
        return NextResponse.json({ data: { ok: true } });
      }
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
