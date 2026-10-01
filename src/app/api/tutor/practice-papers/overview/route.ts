import { NextRequest, NextResponse } from "next/server";
import { subjectDisplayLabel } from "@/lib/quiz-subjects";
import { listTutorPracticePaperOverview } from "@/lib/server/tutor-practice-paper-store";
import { requireTutorSession } from "@/lib/server/tutor-session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionRes = await requireTutorSession(req, { requirePasswordChanged: true });
  if (sessionRes.response || !sessionRes.profile) {
    return sessionRes.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
  }
  try {
    const listed = await listTutorPracticePaperOverview({ codeId: sessionRes.profile.codeId });
    if (!listed.ok) return NextResponse.json({ error: listed.error }, { status: listed.status });
    return NextResponse.json({
      data: {
        month_key: listed.monthKey,
        previous_month_key: listed.previousMonthKey,
        used: listed.used,
        previous_used: listed.previousUsed,
        limit: listed.limit,
        remaining: listed.remaining,
        papers: listed.papers.map((paper) => ({
          id: paper.id,
          student_name: paper.studentName,
          registered_mobile: paper.registeredMobile,
          grade_level: paper.gradeLevel,
          subject: paper.subject,
          subject_label: subjectDisplayLabel(paper.subject),
          month_key: paper.monthKey,
          created_at: paper.createdAt,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入練習卷總覽。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
