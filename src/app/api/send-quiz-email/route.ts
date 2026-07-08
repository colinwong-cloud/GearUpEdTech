import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface TypeBreakdown {
  question_type: string;
  total: number;
  correct: number;
}

interface WrongQuestionDetail {
  question_order: number | null;
  question_content: string;
  question_image_url: string | null;
  student_answer: string | null;
  correct_answer: string | null;
  explanation: string | null;
  opt_a: string | null;
  opt_b: string | null;
  opt_c: string | null;
  opt_d: string | null;
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
  weekly_count: number;
  type_breakdown: TypeBreakdown[];
  wrong_question_details?: WrongQuestionDetail[];
}

type SessionDetailRpcAnswer = {
  student_answer?: string | null;
  is_correct?: boolean;
  question_order?: number | null;
  question?: {
    content?: string | null;
    image_url?: string | null;
    correct_answer?: string | null;
    explanation?: string | null;
    opt_a?: string | null;
    opt_b?: string | null;
    opt_c?: string | null;
    opt_d?: string | null;
  } | null;
};

const MAX_WRONG_QUESTION_DETAILS_IN_EMAIL = 8;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} 秒`;
  return `${m} 分 ${s} 秒`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMultilineHtml(raw: string | null | undefined): string {
  const normalized = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  return escapeHtml(normalized)
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

function normalizeChoiceKey(raw: string | null | undefined): "A" | "B" | "C" | "D" | null {
  const key = (raw || "").trim().toUpperCase();
  if (key === "A" || key === "B" || key === "C" || key === "D") {
    return key;
  }
  return null;
}

function getChoiceValueByKey(detail: WrongQuestionDetail, key: "A" | "B" | "C" | "D"): string | null {
  switch (key) {
    case "A":
      return detail.opt_a;
    case "B":
      return detail.opt_b;
    case "C":
      return detail.opt_c;
    case "D":
      return detail.opt_d;
    default:
      return null;
  }
}

function formatAnswerWithValue(detail: WrongQuestionDetail, rawAnswer: string | null | undefined): string {
  const answer = (rawAnswer || "").trim();
  if (!answer) return "—";
  const choiceKey = normalizeChoiceKey(answer);
  if (!choiceKey) return answer;
  const choiceValue = getChoiceValueByKey(detail, choiceKey);
  if (!choiceValue) return choiceKey;
  return `${choiceKey}（${choiceValue}）`;
}

function extractWrongQuestionDetails(raw: unknown): WrongQuestionDetail[] {
  if (!raw || typeof raw !== "object") return [];
  const payload = raw as { answers?: unknown };
  if (!Array.isArray(payload.answers)) return [];

  const details: WrongQuestionDetail[] = [];
  for (const item of payload.answers as SessionDetailRpcAnswer[]) {
    if (!item || item.is_correct === true) continue;
    const q = item.question || null;
    details.push({
      question_order:
        typeof item.question_order === "number" && Number.isFinite(item.question_order)
          ? item.question_order
          : null,
      question_content: (q?.content || "").trim(),
      question_image_url: (q?.image_url || "").trim() || null,
      student_answer: (item.student_answer || "").trim() || null,
      correct_answer: (q?.correct_answer || "").trim() || null,
      explanation: (q?.explanation || "").trim() || null,
      opt_a: (q?.opt_a || "").trim() || null,
      opt_b: (q?.opt_b || "").trim() || null,
      opt_c: (q?.opt_c || "").trim() || null,
      opt_d: (q?.opt_d || "").trim() || null,
    });
  }

  details.sort((a, b) => {
    if (a.question_order == null && b.question_order == null) return 0;
    if (a.question_order == null) return 1;
    if (b.question_order == null) return -1;
    return a.question_order - b.question_order;
  });

  return details;
}

function buildEmailHtml(data: QuizEmailData): string {
  const {
    session,
    student_name,
    parent_name,
    weekly_count,
    type_breakdown,
    session_practice_summary_parent,
    wrong_question_details = [],
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

  let scoreColor = "#dc2626";
  let scoreBg = "#fef2f2";
  if (pct >= 80) { scoreColor = "#059669"; scoreBg = "#ecfdf5"; }
  else if (pct >= 60) { scoreColor = "#d97706"; scoreBg = "#fffbeb"; }

  const visibleWrongQuestionDetails = wrong_question_details.slice(
    0,
    MAX_WRONG_QUESTION_DETAILS_IN_EMAIL
  );
  const hiddenWrongQuestionCount = Math.max(
    0,
    wrong_question_details.length - visibleWrongQuestionDetails.length
  );

  const typeRow = (t: { question_type: string; total: number; correct: number; pct: number }) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151">${escapeHtml(t.question_type)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;text-align:center">${t.correct}/${t.total}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:${t.pct >= 80 ? '#059669' : t.pct >= 60 ? '#d97706' : '#dc2626'};text-align:center;font-weight:600">${t.pct}%</td>
    </tr>`;

  const wrongQuestionCard = (detail: WrongQuestionDetail, index: number) => {
    const questionOrder = detail.question_order && detail.question_order > 0
      ? detail.question_order
      : index + 1;
    const questionContentHtml = formatMultilineHtml(detail.question_content || "（題目內容未提供）");
    const explanationHtml = formatMultilineHtml(detail.explanation || "沒有解釋");
    const studentAnswerText = formatAnswerWithValue(detail, detail.student_answer);
    const correctAnswerText = formatAnswerWithValue(detail, detail.correct_answer);
    const imageBlock = detail.question_image_url
      ? `<div style="margin:10px 0 0">
          <img
            src="${escapeHtml(detail.question_image_url)}"
            alt="question image"
            style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e5e7eb;display:block"
          />
        </div>`
      : "";

    return `<div style="border:1px solid #fecaca;border-radius:12px;overflow:hidden;margin:0 0 12px;background:#ffffff">
      <div style="background:#fff1f2;padding:10px 12px;border-bottom:1px solid #fecdd3">
        <p style="margin:0;font-size:13px;font-weight:700;color:#b91c1c">第 ${questionOrder} 題 錯題重點</p>
      </div>
      <div style="padding:12px">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6b7280">題目內容</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#1f2937">${questionContentHtml}</p>
        ${imageBlock}

        <div style="margin:10px 0 0;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff">
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.5">你的答案：${escapeHtml(studentAnswerText)}</p>
        </div>

        <div style="margin:8px 0 0;padding:8px 10px;border:1px solid #bbf7d0;border-radius:8px;background:#f0fdf4">
          <p style="margin:0;font-size:13px;color:#166534;line-height:1.5">正確答案：${escapeHtml(correctAnswerText)}</p>
        </div>

        <div style="margin:10px 0 0">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6b7280">解釋</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#374151;background:#f9fafb;border-radius:8px;padding:8px 10px">${explanationHtml}</p>
        </div>
      </div>
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">

  <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 28px">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">GearUp Quiz</h1>
      <p style="margin:8px 0 0;color:#c7d2fe;font-size:14px">練習完成通知</p>
    </div>

    <div style="padding:28px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        ${escapeHtml(greeting)}<strong>${escapeHtml(student_name)}</strong> 剛完成了一次練習！
      </p>

      <p style="margin:0 0 20px;font-size:14px;color:#6b7280">
        這是本週第 <strong style="color:#4f46e5">${weekly_count}</strong> 次練習
      </p>

      <div style="background:${scoreBg};border-radius:12px;padding:20px;text-align:center;margin:0 0 24px">
        <div style="font-size:36px;font-weight:800;color:${scoreColor}">${session.score} / ${session.questions_attempted}</div>
        <div style="font-size:14px;color:#6b7280;margin-top:4px">${pct}% 正確率</div>
      </div>

      ${(session_practice_summary_parent || "").trim() ? `
      <div style="background:#fffbeb;border-radius:12px;padding:16px 18px;margin:0 0 20px;border:2px solid #fde68a">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#b45309">老師給家長的練習小結</p>
        <p style="margin:0;font-size:15px;color:#1f2937;line-height:1.65;white-space:pre-wrap">${escapeHtml(
          session_practice_summary_parent || ""
        )}</p>
      </div>` : ""}

      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">科目</td>
          <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6">${escapeHtml(session.subject)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">用時</td>
          <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6">${formatTime(session.time_spent_seconds)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">答對</td>
          <td style="padding:8px 0;font-size:14px;color:#059669;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6">${session.score} 題</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#6b7280">答錯</td>
          <td style="padding:8px 0;font-size:14px;color:#dc2626;font-weight:600;text-align:right">${incorrect} 題</td>
        </tr>
      </table>

      ${visibleWrongQuestionDetails.length > 0 ? `
      <div style="margin:0 0 20px">
        <h3 style="margin:0 0 10px;font-size:14px;color:#dc2626;font-weight:700">錯題詳情（家長易讀版）</h3>
        ${visibleWrongQuestionDetails.map(wrongQuestionCard).join("")}
        ${hiddenWrongQuestionCount > 0
          ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280">尚有 ${hiddenWrongQuestionCount} 題未展示。</p>`
          : ""}
      </div>`
      : ""}

      ${strongest.length > 0 ? `
      <div style="margin:0 0 16px">
        <h3 style="margin:0 0 8px;font-size:14px;color:#059669;font-weight:700">💪 較強題型</h3>
        <table style="width:100%;border-collapse:collapse">
          <tr style="background:#f9fafb">
            <th style="padding:6px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">題型</th>
            <th style="padding:6px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600">答對/總數</th>
            <th style="padding:6px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600">正確率</th>
          </tr>
          ${strongest.map(typeRow).join("")}
        </table>
      </div>` : ""}

      ${weakest.length > 0 ? `
      <div style="margin:0 0 16px">
        <h3 style="margin:0 0 8px;font-size:14px;color:#dc2626;font-weight:700">📝 需加強題型</h3>
        <table style="width:100%;border-collapse:collapse">
          <tr style="background:#f9fafb">
            <th style="padding:6px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">題型</th>
            <th style="padding:6px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600">答對/總數</th>
            <th style="padding:6px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600">正確率</th>
          </tr>
          ${weakest.map(typeRow).join("")}
        </table>
      </div>` : ""}
    </div>

    <div style="background:#f9fafb;padding:20px 28px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center">
        Keep up the great work! 繼續加油！ 💪
      </p>
    </div>

  </div>

  <p style="margin:16px 0 0;font-size:11px;color:#d1d5db;text-align:center">
    GearUp Quiz — 由系統自動發送
  </p>

</div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
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

    const { data: detailData, error: detailErr } = await supabase.rpc(
      "get_session_detail",
      { p_session_id: session_id }
    );
    if (!detailErr && detailData) {
      emailData.wrong_question_details = extractWrongQuestionDetails(detailData);
    } else if (detailErr) {
      console.warn("get_session_detail failed for email readability block:", detailErr.message);
    }

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
