import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface QuizResult {
  questionContent: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string;
}

interface SendResultsBody {
  email: string;
  score: number;
  total: number;
  percentage: number;
  results: QuizResult[];
}

export async function POST(request: NextRequest) {
  try {
    const body: SendResultsBody = await request.json();
    const { email, score, total, percentage, results } = body;

    if (!email || !results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: "Missing required fields: email, results" },
        { status: 400 }
      );
    }

    const resultsHtml = results
      .map(
        (r, i) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px; font-size: 14px; color: #374151;">
            <strong>${i + 1}.</strong> ${r.questionContent}
          </td>
          <td style="padding: 12px; text-align: center; font-weight: 600;">
            ${r.studentAnswer}
          </td>
          <td style="padding: 12px; text-align: center;">
            <span style="
              display: inline-block;
              padding: 4px 12px;
              border-radius: 9999px;
              font-size: 13px;
              font-weight: 500;
              background: ${r.isCorrect ? "#d1fae5" : "#fee2e2"};
              color: ${r.isCorrect ? "#065f46" : "#991b1b"};
            ">
              ${r.isCorrect ? "Correct" : "Wrong"}
            </span>
          </td>
          <td style="padding: 12px; font-size: 13px; color: #6b7280;">
            ${!r.isCorrect ? `<span style="color: #dc2626; font-weight: 500;">Correct: ${r.correctAnswer}</span><br/>${r.explanation || ""}` : "—"}
          </td>
        </tr>`
      )
      .join("");

    let scoreBg = "#fef2f2";
    let scoreColor = "#dc2626";
    if (percentage >= 80) {
      scoreBg = "#ecfdf5";
      scoreColor = "#059669";
    } else if (percentage >= 60) {
      scoreBg = "#fffbeb";
      scoreColor = "#d97706";
    }

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 700px; margin: 0 auto; color: #1f2937;">
        <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">GearUp Quiz Results</h1>
        </div>

        <div style="background: ${scoreBg}; padding: 24px; text-align: center; border: 1px solid #e5e7eb;">
          <p style="font-size: 48px; font-weight: 800; color: ${scoreColor}; margin: 0;">
            ${score} / ${total}
          </p>
          <p style="font-size: 18px; color: #6b7280; margin: 8px 0 0;">
            ${percentage}% correct
          </p>
        </div>

        <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280;">Question</th>
                <th style="padding: 12px; text-align: center; font-size: 12px; text-transform: uppercase; color: #6b7280;">Answer</th>
                <th style="padding: 12px; text-align: center; font-size: 12px; text-transform: uppercase; color: #6b7280;">Result</th>
                <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280;">Explanation</th>
              </tr>
            </thead>
            <tbody>
              ${resultsHtml}
            </tbody>
          </table>
        </div>

        <p style="text-align: center; font-size: 13px; color: #9ca3af; margin-top: 24px;">
          Sent by GearUp Quiz
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: "GearUp Quiz <onboarding@resend.dev>",
      to: [email],
      subject: `Your Quiz Results — ${score}/${total} (${percentage}%)`,
      html,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
