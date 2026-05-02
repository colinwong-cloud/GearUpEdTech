-- STEP 3: Create session answers (10 per session)
-- Run this after Step 2 completes
-- NOTE: This creates ~1M rows. May take several minutes.

INSERT INTO session_answers (session_id, question_id, student_answer, is_correct, question_order, created_at)
SELECT
  qs.id AS session_id,
  q.id AS question_id,
  CASE WHEN q.rn <= qs.score THEN q.correct_answer ELSE 'X' END AS student_answer,
  q.rn <= qs.score AS is_correct,
  q.rn::int AS question_order,
  qs.created_at
FROM quiz_sessions qs
JOIN students s ON s.id = qs.student_id
JOIN parents p ON p.id = s.parent_id
CROSS JOIN LATERAL (
  SELECT q2.id, q2.correct_answer,
    ROW_NUMBER() OVER (ORDER BY random()) AS rn
  FROM questions q2
  WHERE q2.grade_level = s.grade_level
  LIMIT 10
) q
WHERE p.mobile_number = '99990001'
AND NOT EXISTS (
  SELECT 1 FROM session_answers sa WHERE sa.session_id = qs.id LIMIT 1
);
