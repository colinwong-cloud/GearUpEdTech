/** Matches `questions.subject` / `quiz_sessions.subject` / balance `subject` in DB */
export const PRIMARY_QUIZ_SUBJECT = "Math";

/** Student subject picker: `key` must match DB */
export const STUDENT_SUBJECT_OPTIONS = [
  { key: PRIMARY_QUIZ_SUBJECT, label: "數學", icon: "🔢" },
] as const;
