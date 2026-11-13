/** Persist logged-in student context for /guoyu routes (no PIN stored). */

export const GUOYU_STUDENT_RESUME_KEY = "gearup_guoyu_student_resume_v1";

export type GuoyuStudentResume = {
  mobileNumber: string;
  students: Array<{
    id: string;
    parent_id: string;
    student_name: string;
    avatar_style: string;
    grade_level: string;
    created_at: string;
    gender?: string | null;
  }>;
  selectedStudentId: string;
  parentTier: {
    tier: "free" | "paid";
    is_paid: boolean;
    paid_until: string | null;
    tier_label: string;
  };
  returnScreen: "subject_select" | "guoyu_compose" | "zhongwen_xiezuo" | "payment";
  guoyuDraftText?: string;
  zhongwenXiezuoDraftText?: string;
};

export function saveGuoyuStudentResume(payload: GuoyuStudentResume): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(GUOYU_STUDENT_RESUME_KEY, JSON.stringify(payload));
}

export function readGuoyuStudentResume(): GuoyuStudentResume | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(GUOYU_STUDENT_RESUME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuoyuStudentResume;
  } catch {
    return null;
  }
}

export function clearGuoyuStudentResume(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(GUOYU_STUDENT_RESUME_KEY);
}
