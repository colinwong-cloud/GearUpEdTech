-- ============================================================
-- Optional: backfill English balance (300) for students missing it
-- Run once in Supabase SQL Editor after adding English to the app.
-- ============================================================

INSERT INTO student_balances (student_id, subject, remaining_questions)
SELECT s.id, 'English', 300
FROM students s
WHERE NOT EXISTS (
  SELECT 1 FROM student_balances b
  WHERE b.student_id = s.id AND lower(trim(b.subject)) = 'english'
);
