/** DB `questions.subject` / `quiz_sessions.subject` / balance `subject` for math */
export const PRIMARY_QUIZ_SUBJECT = "Math";

/** DB subject key for Chinese (must match `questions.subject` in Supabase) */
export const CHINESE_QUIZ_SUBJECT = "Chinese";

/** Previous DB value for math (rename to `Math`). Used in queries until rows are migrated. */
export const LEGACY_PRIMARY_QUIZ_SUBJECT_KEY = "數學";

/** Patterns for Supabase `.ilikeAnyOf("subject", …)` so questions load during and after migration. */
export function quizSubjectDbPatterns(subjectKey: string): readonly string[] {
  if (subjectKey === PRIMARY_QUIZ_SUBJECT) {
    return [PRIMARY_QUIZ_SUBJECT, LEGACY_PRIMARY_QUIZ_SUBJECT_KEY];
  }
  return [subjectKey];
}

/** Student / parent UI: `key` must match DB `subject` */
export const STUDENT_SUBJECT_OPTIONS = [
  { key: PRIMARY_QUIZ_SUBJECT, label: "數學", icon: "🔢" },
  { key: CHINESE_QUIZ_SUBJECT, label: "中文", icon: "📖" },
] as const;

export type QuizSubjectKey = (typeof STUDENT_SUBJECT_OPTIONS)[number]["key"];

/** Label for question-count line etc. (avoid showing raw "Math" to users) */
export function subjectDisplayLabel(subjectKey: string): string {
  const row = STUDENT_SUBJECT_OPTIONS.find((o) => o.key === subjectKey);
  return row?.label ?? subjectKey;
}
