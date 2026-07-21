import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabaseAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface TypeBreakdown {
  question_type: string;
  total: number;
  correct: number;
}

interface WrongAnswerDetail {
  question_order: number | null;
  student_answer: string | null;
  question: {
    content: string;
    explanation: string | null;
    correct_answer: string;
    opt_a: string | null;
    opt_b: string | null;
    opt_c: string | null;
    opt_d: string | null;
  };
}

interface QuizEmailData {
  parent_name: string | null;
  parent_email: string | null;
  email_notifications_enabled: boolean;
  student_name: string;
  session: {
    id: string;
    subject: string;
    questions_attempted: number;
    score: number;
    time_spent_seconds: number;
    created_at: string;
  };
  /** 學生向小結（結果頁），可來自 DB */
  session_practice_summary?: string;
  /** 家長電郵用（老師視角），可來自 DB */
  session_practice_summary_parent?: string;
  /** 家長電郵錯題詳解（與結果頁一致） */
  wrong_answer_details?: WrongAnswerDetail[];
  weekly_count: number;
  type_breakdown: TypeBreakdown[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} 秒`;
  return `${m} 分 ${s} 秒`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toHtmlWithLineBreaks(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}

function isShortAnswerQuestion(
  question: WrongAnswerDetail["question"]
): boolean {
  return (
    question.opt_a == null &&
    question.opt_b == null &&
    question.opt_c == null &&
    question.opt_d == null
  );
}

function getOptionValueByAnswer(
  question: WrongAnswerDetail["question"],
  answer: string | null | undefined
): string | null {
  const key = String(answer || "").trim().toUpperCase();
  if (key === "A") return question.opt_a;
  if (key === "B") return question.opt_b;
  if (key === "C") return question.opt_c;
  if (key === "D") return question.opt_d;
  return null;
}

function formatAnswerWithValue(
  question: WrongAnswerDetail["question"],
  answer: string | null | undefined
): string {
  const raw = String(answer || "").trim();
  if (!raw) return "—";
  if (isShortAnswerQuestion(question)) return raw;
  const key = raw.toUpperCase();
  const optionValue = getOptionValueByAnswer(question, key);
  if (optionValue && optionValue.trim()) {
    return `${key} (${optionValue.trim()})`;
  }
  return key;
}

function normalizeWrongAnswerRows(rows: unknown[]): WrongAnswerDetail[] {
  const normalized: WrongAnswerDetail[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const isCorrect = Boolean(obj.is_correct);
    if (isCorrect) continue;
    const rawQuestion =
      obj.question && typeof obj.question === "object"
        ? (obj.question as Record<string, unknown>)
        : null;
    if (!rawQuestion) continue;
    const content = String(rawQuestion.content ?? "").trim();
    if (!content) continue;
    normalized.push({
      question_order:
        typeof obj.question_order === "number" ? obj.question_order : null,
      student_answer:
        obj.student_answer == null ? null : String(obj.student_answer),
      question: {
        content,
        explanation:
          rawQuestion.explanation == null
            ? null
            : String(rawQuestion.explanation),
        correct_answer: String(rawQuestion.correct_answer ?? ""),
        opt_a: rawQuestion.opt_a == null ? null : String(rawQuestion.opt_a),
        opt_b: rawQuestion.opt_b == null ? null : String(rawQuestion.opt_b),
        opt_c: rawQuestion.opt_c == null ? null : String(rawQuestion.opt_c),
        opt_d: rawQuestion.opt_d == null ? null : String(rawQuestion.opt_d),
      },
    });
  }
  return normalized.sort((a, b) => {
    const ao = a.question_order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.question_order ?? Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });
}

async function fetchWrongAnswerDetails(
  sessionId: string,
  supabaseService: NonNullable<ReturnType<typeof getSupabaseServiceClient>>
): Promise<WrongAnswerDetail[]> {
  try {
    const { data: rpcData, error: rpcErr } = await supabaseService.rpc(
      "get_session_detail",
      { p_session_id: sessionId }
    );
    if (!rpcErr && rpcData && typeof rpcData === "object") {
      const answers = (rpcData as { answers?: unknown[] }).answers;
      if (Array.isArray(answers)) {
        return normalizeWrongAnswerRows(answers);
      }
    }
  } catch {
    // fallback query below
  }

  try {
    const { data: wrongRows, error: wrongErr } = await supabaseService
      .from("session_answers")
      .select("question_id,question_order,student_answer,is_correct")
      .eq("session_id", sessionId)
      .eq("is_correct", false)
      .order("question_order", { ascending: true });
    if (wrongErr || !Array.isArray(wrongRows) || wrongRows.length === 0) {
      return [];
    }

    const questionIds = Array.from(
      new Set(
        wrongRows
          .map((row) => (row?.question_id == null ? "" : String(row.question_id)))
          .filter(Boolean)
      )
    );
    if (questionIds.length === 0) return [];

    const { data: questions, error: qErr } = await supabaseService
      .from("questions")
      .select("id,content,explanation,correct_answer,opt_a,opt_b,opt_c,opt_d")
      .in("id", questionIds);
    if (qErr || !Array.isArray(questions)) return [];

    const byId = new Map<string, Record<string, unknown>>();
    for (const q of questions) {
      if (q?.id == null) continue;
      byId.set(String(q.id), q as Record<string, unknown>);
    }

    const merged = wrongRows.map((row) => ({
      ...row,
      question:
        row?.question_id == null ? null : byId.get(String(row.question_id)) || null,
    }));
    return normalizeWrongAnswerRows(merged as unknown[]);
  } catch {
    return [];
  }
}

function buildEmailHtml(data: QuizEmailData): string {
  const {
    session,
    student_name,
    parent_name,
    weekly_count,
    type_breakdown,
    session_practice_summary_parent,
    wrong_answer_details,
  } = data;
  const incorrect = session.questions_attempted - session.score;
  const pct = session.questions_attempted > 0
    ? Math.round((session.score / session.questions_attempted) * 100)
    : 0;

  const greeting = parent_name
    ? `Hi ${parent_name}，`
    : "家長您好，";

  const ranked = type_breakdown
    .map((t) => ({
      ...t,
      pct: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  const strongest = ranked.slice(0, 2);
  const weakest = ranked.length > 2
    ? ranked.slice(-2).reverse()
    : ranked.length === 2
      ? [ranked[1]]
      : [];

  const wrongAnswerDetails = Array.isArray(wrong_answer_details)
    ? wrong_answer_details
    : [];

  let scoreColor = "#dc2626";
  let scoreBg = "#fef2f2";
  if (pct >= 80) { scoreColor = "#059669"; scoreBg = "#ecfdf5"; }
  else if (pct >= 60) { scoreColor = "#d97706"; scoreBg = "#fffbeb"; }

  const typeRow = (t: { question_type: string; total: number; correct: number; pct: number }) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151">${t.question_type}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;text-align:center">${t.correct}/${t.total}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:${t.pct >= 80 ? '#059669' : t.pct >= 60 ? '#d97706' : '#dc2626'};text-align:center;font-weight:600">${t.pct}%</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root {
      color-scheme: light only;
      supported-color-schemes: light;
    }
    body, table, td, p, h1, h2, h3 {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }
    .force-bg { background: #eef2ff !important; }
    .force-card { background: #ffffff !important; }
    .force-text { color: #111827 !important; }
    .force-muted { color: #374151 !important; }
    .summary-text { font-size: 17px !important; line-height: 1.9 !important; color: #111827 !important; }
    @media (prefers-color-scheme: dark) {
      body, .force-bg { background: #eef2ff !important; }
      .force-card { background: #ffffff !important; }
      .force-text { color: #111827 !important; }
      .force-muted { color: #374151 !important; }
    }
    [data-ogsc] .force-bg { background: #eef2ff !important; }
    [data-ogsc] .force-card { background: #ffffff !important; }
    [data-ogsc] .force-text { color: #111827 !important; }
    [data-ogsc] .force-muted { color: #374151 !important; }
  </style>
</head>
<body class="force-bg" style="margin:0;padding:0;background:#eef2ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
<div class="force-bg" style="max-width:560px;margin:0 auto;padding:24px 16px;background:#eef2ff">

  <div class="force-card" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 28px">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">GearUp Quiz</h1>
      <p style="margin:8px 0 0;color:#c7d2fe;font-size:14px">練習完成通知</p>
    </div>

    <div style="padding:28px">
      <p class="force-text" style="margin:0 0 16px;font-size:16px;color:#1f2937;line-height:1.75">
        ${greeting}<strong>${student_name}</strong> 剛完成了一次練習！
      </p>

      <p class="force-muted" style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.65">
        這是本週第 <strong style="color:#4f46e5">${weekly_count}</strong> 次練習
      </p>

      <div style="background:${scoreBg};border-radius:12px;padding:20px;text-align:center;margin:0 0 24px">
        <div style="font-size:36px;font-weight:800;color:${scoreColor}">${session.score} / ${session.questions_attempted}</div>
        <div style="font-size:14px;color:#374151;margin-top:4px">${pct}% 正確率</div>
      </div>

      ${(session_practice_summary_parent || "").trim() ? `
      <div style="background:#fffbeb;border-radius:12px;padding:16px 18px;margin:0 0 20px;border:2px solid #f59e0b">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#92400e">老師給家長的練習小結</p>
        <p class="summary-text" style="margin:0;font-size:17px;color:#111827;line-height:1.9;white-space:pre-wrap;font-weight:500">${(session_practice_summary_parent || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
        }</p>
      </div>` : ""}

      <table style="width:100%;border-collapse:collapse;margin:0 0 24px;background:#ffffff">
        <tr>
          <td class="force-muted" style="padding:8px 0;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb">科目</td>
          <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6">${session.subject}</td>
        </tr>
        <tr>
          <td class="force-muted" style="padding:8px 0;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb">用時</td>
          <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6">${formatTime(session.time_spent_seconds)}</td>
        </tr>
        <tr>
          <td class="force-muted" style="padding:8px 0;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb">答對</td>
          <td style="padding:8px 0;font-size:14px;color:#059669;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6">${session.score} 題</td>
        </tr>
        <tr>
          <td class="force-muted" style="padding:8px 0;font-size:14px;color:#374151">答錯</td>
          <td style="padding:8px 0;font-size:14px;color:#dc2626;font-weight:600;text-align:right">${incorrect} 題</td>
        </tr>
      </table>

      ${strongest.length > 0 ? `
      <div style="margin:0 0 16px">
        <h3 style="margin:0 0 8px;font-size:14px;color:#059669;font-weight:700">💪 較強題型</h3>
        <table style="width:100%;border-collapse:collapse">
          <tr style="background:#f9fafb">
            <th style="padding:6px 12px;text-align:left;font-size:12px;color:#374151;font-weight:600">題型</th>
            <th style="padding:6px 12px;text-align:center;font-size:12px;color:#374151;font-weight:600">答對/總數</th>
            <th style="padding:6px 12px;text-align:center;font-size:12px;color:#374151;font-weight:600">正確率</th>
          </tr>
          ${strongest.map(typeRow).join("")}
        </table>
      </div>` : ""}

      ${weakest.length > 0 ? `
      <div style="margin:0 0 16px">
        <h3 style="margin:0 0 8px;font-size:14px;color:#dc2626;font-weight:700">📝 需加強題型</h3>
        <table style="width:100%;border-collapse:collapse">
          <tr style="background:#f9fafb">
            <th style="padding:6px 12px;text-align:left;font-size:12px;color:#374151;font-weight:600">題型</th>
            <th style="padding:6px 12px;text-align:center;font-size:12px;color:#374151;font-weight:600">答對/總數</th>
            <th style="padding:6px 12px;text-align:center;font-size:12px;color:#374151;font-weight:600">正確率</th>
          </tr>
          ${weakest.map(typeRow).join("")}
        </table>
      </div>` : ""}

      ${wrongAnswerDetails.length > 0 ? `
      <div style="margin:4px 0 0">
        <h3 style="margin:0 0 10px;font-size:15px;color:#991b1b;font-weight:800">錯題詳解（錯題逐題詳解）</h3>
        ${wrongAnswerDetails
          .map((row, index) => {
            const questionLabel = row.question_order != null ? row.question_order : index + 1;
            const studentAnswerDisplay = formatAnswerWithValue(row.question, row.student_answer);
            const correctAnswerDisplay = formatAnswerWithValue(
              row.question,
              row.question.correct_answer
            );
            return `
        <div style="border:1px solid #fecaca;border-radius:14px;overflow:hidden;margin:0 0 12px;background:#ffffff">
          <div style="background:#fef2f2;padding:10px 12px;border-bottom:1px solid #fecaca">
            <span style="font-size:14px;font-weight:700;color:#dc2626">第 ${questionLabel} 題</span>
          </div>
          <div style="padding:12px">
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin:0 0 8px">
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#6b7280">題目內容</p>
              <p style="margin:0;font-size:14px;color:#1f2937;line-height:1.7">${toHtmlWithLineBreaks(row.question.content)}</p>
            </div>
            <table style="width:100%;border-collapse:separate;border-spacing:0 8px">
              <tr>
                <td style="width:50%;padding-right:4px;vertical-align:top">
                  <div style="border:1px solid #fecaca;background:#fef2f2;border-radius:10px;padding:10px">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#dc2626">你的答案（值）</p>
                    <p style="margin:0;font-size:14px;font-weight:700;color:#b91c1c">${escapeHtml(studentAnswerDisplay)}</p>
                  </div>
                </td>
                <td style="width:50%;padding-left:4px;vertical-align:top">
                  <div style="border:1px solid #bbf7d0;background:#ecfdf5;border-radius:10px;padding:10px">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#059669">正確答案（值）</p>
                    <p style="margin:0;font-size:14px;font-weight:700;color:#047857">${escapeHtml(correctAnswerDisplay)}</p>
                  </div>
                </td>
              </tr>
            </table>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px">
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#6b7280">解釋</p>
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">${row.question.explanation ? toHtmlWithLineBreaks(row.question.explanation) : "沒有解釋"}</p>
            </div>
          </div>
        </div>`;
          })
          .join("")}
      </div>` : ""}
    </div>

    <div style="background:#f9fafb;padding:20px 28px;border-top:1px solid #d1d5db">
      <p class="force-muted" style="margin:0;font-size:13px;color:#4b5563;text-align:center;line-height:1.6">
        Keep up the great work! 繼續加油！ 💪
      </p>
    </div>

  </div>

  <p class="force-muted" style="margin:16px 0 0;font-size:11px;color:#6b7280;text-align:center;line-height:1.55">
    GearUp Quiz — 由系統自動發送
  </p>

</div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAnonClient();
    const supabaseService = getSupabaseServiceClient();
    if (!supabase || !supabaseService) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 503 }
      );
    }

    const body = (await req.json()) as {
      student_id?: string;
      session_id?: string;
      /** request body backup when DB column not migrated yet */
      session_summary_parent?: string;
    };
    const { student_id, session_id, session_summary_parent } = body;
    if (!student_id || !session_id) {
      return NextResponse.json({ error: "Missing student_id or session_id" }, { status: 400 });
    }

    const { data, error: rpcErr } = await supabase.rpc("get_quiz_email_data", {
      p_student_id: student_id,
      p_session_id: session_id,
    });

    if (rpcErr) {
      console.error("RPC error:", rpcErr);
      return NextResponse.json({ error: "Failed to fetch quiz data" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }
    const emailData = { ...(data as QuizEmailData) } as QuizEmailData;
    if (
      session_summary_parent &&
      typeof session_summary_parent === "string" &&
      session_summary_parent.trim() &&
      !emailData.session_practice_summary_parent?.trim()
    ) {
      emailData.session_practice_summary_parent = session_summary_parent.trim();
    }
    emailData.wrong_answer_details = await fetchWrongAnswerDetails(
      session_id,
      supabaseService
    );

    if (!emailData.parent_email) {
      return NextResponse.json({ skipped: true, reason: "no_parent_email" });
    }

    if (emailData.email_notifications_enabled === false) {
      return NextResponse.json({ skipped: true, reason: "parent_notifications_disabled" });
    }

    const { data: settings } = await supabaseService.rpc("admin_get_settings");
    if (settings && (settings as Record<string, string>).email_notifications_enabled === "false") {
      return NextResponse.json({ skipped: true, reason: "global_notifications_disabled" });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    const html = buildEmailHtml(emailData);

    const { error: sendErr } = await getResend().emails.send({
      from: "GearUp Quiz <noreply@updates.hkedutech.com>",
      to: emailData.parent_email,
      subject: `${emailData.student_name} 完成了一次練習 — ${emailData.session.score}/${emailData.session.questions_attempted} 正確`,
      html,
    });

    if (sendErr) {
      console.error("Resend error:", sendErr);
      return NextResponse.json(
        { error: "Failed to send email", detail: sendErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("Email API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
