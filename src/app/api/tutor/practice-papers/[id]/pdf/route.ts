import { NextRequest, NextResponse } from "next/server";
import { subjectDisplayLabel } from "@/lib/quiz-subjects";
import { getPracticePaperForTutor, TUTOR_PRACTICE_PAPER_TABLE_HINT } from "@/lib/server/tutor-practice-paper-store";
import { buildPracticePaperPdf } from "@/lib/server/tutor-practice-paper-pdf";
import { requireTutorSession } from "@/lib/server/tutor-session";
import type { PracticePaperQuestion } from "@/lib/tutor-practice-paper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadImages(questions: PracticePaperQuestion[]): Promise<Array<Uint8Array | null>> {
  return Promise.all(
    questions.map(async (question) => {
      const url = question.image_url?.trim() || "";
      if (!url.startsWith("https://")) return null;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > 4_000_000) return null;
        return bytes;
      } catch {
        return null;
      }
    })
  );
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const sessionRes = await requireTutorSession(req, { requirePasswordChanged: true });
  if (sessionRes.response || !sessionRes.profile) {
    return sessionRes.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
  }
  const kindParam = req.nextUrl.searchParams.get("kind") || "student";
  if (kindParam !== "student" && kindParam !== "answer") {
    return NextResponse.json({ error: "請選擇學生卷或答案卷。" }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const paper = await getPracticePaperForTutor({
      codeId: sessionRes.profile.codeId,
      paperId: id,
    });
    if (!paper) return NextResponse.json({ error: "找不到這份練習卷。" }, { status: 404 });
    const images = await loadImages(paper.questions);
    const pdf = await buildPracticePaperPdf({
      kind: kindParam,
      studentName: paper.studentName,
      gradeLevel: paper.gradeLevel,
      subjectKey: paper.subject,
      createdAt: paper.createdAt ? new Date(paper.createdAt) : new Date(),
      questions: paper.questions,
      images,
    });
    const label = kindParam === "answer" ? "答案卷" : "學生卷";
    const filename = `GearUp-${subjectDisplayLabel(paper.subject)}-${paper.studentName}-${label}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="gearup-practice.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未能產生 PDF。";
    const status = message === TUTOR_PRACTICE_PAPER_TABLE_HINT ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
