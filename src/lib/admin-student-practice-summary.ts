export type RawPracticeSessionRow = {
  student_id: string;
  subject: string | null;
  score: number | null;
  questions_attempted: number | null;
  created_at: string | null;
  hkt_practice_date?: string | null;
};

export type StudentPracticeSummaryRow = {
  student_id: string;
  practice_date: string;
  subject: string;
  sessions_count: number;
  questions_attempted: number;
  correct_count: number;
  correct_rate: number;
};

function toSafeNumber(value: number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSubject(value: string | null): string {
  const raw = (value || "").trim();
  if (!raw) return "Unknown";
  const lowered = raw.toLowerCase();
  if (lowered === "數學") return "Math";
  if (lowered === "math") return "Math";
  if (lowered === "chinese") return "Chinese";
  if (lowered === "english") return "English";
  return raw;
}

function toHktDateKeyFromIso(isoString: string | null): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function resolvePracticeDate(row: RawPracticeSessionRow): string | null {
  const direct = (row.hkt_practice_date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  return toHktDateKeyFromIso(row.created_at);
}

export function buildStudentPracticeSummaryRows(
  rows: RawPracticeSessionRow[]
): StudentPracticeSummaryRow[] {
  const grouped = new Map<
    string,
    {
      student_id: string;
      practice_date: string;
      subject: string;
      sessions_count: number;
      questions_attempted: number;
      correct_count: number;
    }
  >();

  for (const row of rows) {
    const studentId = (row.student_id || "").trim();
    if (!studentId) continue;
    const practiceDate = resolvePracticeDate(row);
    if (!practiceDate) continue;
    const subject = normalizeSubject(row.subject);
    const questionsAttempted = Math.max(0, toSafeNumber(row.questions_attempted));
    if (questionsAttempted <= 0) continue;
    const correctCount = Math.max(0, Math.min(questionsAttempted, toSafeNumber(row.score)));
    const key = `${studentId}__${practiceDate}__${subject}`;
    const prev = grouped.get(key) ?? {
      student_id: studentId,
      practice_date: practiceDate,
      subject,
      sessions_count: 0,
      questions_attempted: 0,
      correct_count: 0,
    };
    prev.sessions_count += 1;
    prev.questions_attempted += questionsAttempted;
    prev.correct_count += correctCount;
    grouped.set(key, prev);
  }

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      correct_rate:
        row.questions_attempted > 0
          ? Math.round((row.correct_count / row.questions_attempted) * 10000) / 100
          : 0,
    }))
    .sort((a, b) => {
      if (a.student_id !== b.student_id) return a.student_id.localeCompare(b.student_id);
      if (a.practice_date !== b.practice_date) return b.practice_date.localeCompare(a.practice_date);
      return a.subject.localeCompare(b.subject);
    });
}
