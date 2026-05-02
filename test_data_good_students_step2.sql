-- STEP 2: Create quiz sessions for good students (30 per student)
-- Scores 8-10 out of 10 (75-100% range)

INSERT INTO quiz_sessions (student_id, subject, questions_attempted, score, time_spent_seconds, created_at)
SELECT
  s.id,
  '數學',
  10,
  floor(random() * 3 + 8)::int,  -- score 8, 9, or 10 (80-100%)
  floor(random() * 300 + 60)::int,
  NOW() - (seq.n || ' hours')::interval
FROM students s
JOIN parents p ON p.id = s.parent_id
CROSS JOIN generate_series(1, 30) AS seq(n)
WHERE p.mobile_number = '99990002';
