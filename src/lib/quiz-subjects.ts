/** Matches `questions.subject` / `quiz_sessions.subject` / balance `subject` in DB */
export const PRIMARY_QUIZ_SUBJECT = "Math";

/** Previous DB value for the primary subject (rename to `Math`). Used in queries until rows are migrated. */
export const LEGACY_PRIMARY_QUIZ_SUBJECT_KEY = "數學";

/** Patterns for Supabase `.ilikeAnyOf("subject", …)` so questions load during and after migration. */
export function quizSubjectDbPatterns(subjectKey: string): readonly string[] {
  if (subjectKey === PRIMARY_QUIZ_SUBJECT) {
    return [PRIMARY_QUIZ_SUBJECT, LEGACY_PRIMARY_QUIZ_SUBJECT_KEY];
  }
  return [subjectKey];
}

/** Student subject picker: `key` must match DB */
export const STUDENT_SUBJECT_OPTIONS = [
  { key: PRIMARY_QUIZ_SUBJECT, label: "數學", icon: "🔢" },
] as const;
