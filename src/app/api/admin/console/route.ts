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
  | "update_question"
  | "mtd_parent_questions_summary";

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

function getHktMonthToDateRangeIso(now = new Date()) {
  const hktOffsetMs = 8 * 60 * 60 * 1000;
  const hktNowMs = now.getTime() + hktOffsetMs;
  const hktNow = new Date(hktNowMs);
  const y = hktNow.getUTCFullYear();
  const m = hktNow.getUTCMonth();
  const month = `${y}-${String(m + 1).padStart(2, "0")}`;
  const startUtcMs = Date.UTC(y, m, 1, 0, 0, 0, 0) - hktOffsetMs;
  return {
    month,
    startIso: new Date(startUtcMs).toISOString(),
    endIso: now.toISOString(),
  };
}

function readString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toSafePositiveInt(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const normalized = Math.trunc(n);
  return normalized > 0 ? normalized : 0;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length <= chunkSize) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
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
      case "mtd_parent_questions_summary": {
        type SessionRow = {
          student_id: string | null;
          questions_attempted: number | null;
        };
        type StudentRow = {
          id: string;
          parent_id: string | null;
        };
        type ParentRow = {
          id: string;
          mobile_number: string | null;
        };

        const { month, startIso, endIso } = getHktMonthToDateRangeIso();
        const { data: sessionData, error: sessionErr } = await admin
          .from("quiz_sessions")
          .select("student_id,questions_attempted,created_at")
          .gt("questions_attempted", 0)
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .limit(50000);
        if (sessionErr) throw sessionErr;

        const sessions = (sessionData as SessionRow[] | null) ?? [];
        const studentIds = Array.from(
          new Set(
            sessions
              .map((row) => readString(row.student_id))
              .filter((studentId) => studentId.length > 0)
          )
        );

        const parentIdByStudentId = new Map<string, string>();
        if (studentIds.length > 0) {
          for (const chunk of chunkArray(studentIds, 400)) {
            const { data: students, error: studentsErr } = await admin
              .from("students")
              .select("id,parent_id")
              .in("id", chunk);
            if (studentsErr) throw studentsErr;
            for (const student of (students as StudentRow[] | null) ?? []) {
              const studentId = readString(student.id);
              const parentId = readString(student.parent_id);
              if (!studentId || !parentId) continue;
              parentIdByStudentId.set(studentId, parentId);
            }
          }
        }

        const parentIds = Array.from(new Set(parentIdByStudentId.values()));
        const parentMobileById = new Map<string, string>();
        if (parentIds.length > 0) {
          for (const chunk of chunkArray(parentIds, 400)) {
            const { data: parents, error: parentsErr } = await admin
              .from("parents")
              .select("id,mobile_number")
              .in("id", chunk);
            if (parentsErr) throw parentsErr;
            for (const parent of (parents as ParentRow[] | null) ?? []) {
              const parentId = readString(parent.id);
              if (!parentId) continue;
              parentMobileById.set(parentId, readString(parent.mobile_number) || "—");
            }
          }
        }

        const totalQuestionsByMobile = new Map<string, number>();
        for (const session of sessions) {
          const studentId = readString(session.student_id);
          if (!studentId) continue;
          const parentId = parentIdByStudentId.get(studentId);
          if (!parentId) continue;
          const totalQuestions = toSafePositiveInt(session.questions_attempted);
          if (totalQuestions <= 0) continue;
          const parentMobile = parentMobileById.get(parentId) || "—";
          totalQuestionsByMobile.set(
            parentMobile,
            (totalQuestionsByMobile.get(parentMobile) ?? 0) + totalQuestions
          );
        }

        const rows = Array.from(totalQuestionsByMobile.entries())
          .map(([parent_mobile, total_questions]) => ({
            parent_mobile,
            total_questions,
          }))
          .sort(
            (a, b) =>
              b.total_questions - a.total_questions ||
              a.parent_mobile.localeCompare(b.parent_mobile)
          );

        return NextResponse.json({
          data: {
            month,
            rows,
          },
        });
      }
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
