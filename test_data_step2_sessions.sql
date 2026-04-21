-- STEP 2: Create quiz sessions (30 per student)
-- Run this after Step 1 completes

INSERT INTO quiz_sessions (student_id, subject, questions_attempted, score, time_spent_seconds, created_at)
SELECT
  s.id,
  '數學',
  10,
  floor(random() * 11)::int,
  floor(random() * 300 + 30)::int,
  NOW() - (seq.n || ' hours')::interval
FROM students s
JOIN parents p ON p.id = s.parent_id
CROSS JOIN generate_series(1, 30) AS seq(n)
WHERE p.mobile_number = '99990001';
