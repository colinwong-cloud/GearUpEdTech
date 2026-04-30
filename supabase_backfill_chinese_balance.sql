-- ============================================================
-- Optional: backfill Chinese balance (300) for students missing it
-- Run once in Supabase SQL Editor after adding Chinese to the app.
-- Skips students who already have a `Chinese` row in student_balances.
-- (No balance_transactions row — history stays clean; parent total updates.)
-- ============================================================

INSERT INTO student_balances (student_id, subject, remaining_questions)
SELECT s.id, 'Chinese', 300
FROM students s
WHERE NOT EXISTS (
  SELECT 1 FROM student_balances b
  WHERE b.student_id = s.id AND lower(trim(b.subject)) = 'chinese'
);
