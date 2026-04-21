-- STEP 3: Create session answers for good students
-- For 數與代數 questions: >95% correct (almost always correct)
-- For other question types: 75-100% correct (random)
--
-- Logic: Pick 10 questions per session. For each question:
-- - If question_type contains '代數' or 'Algebra': 96% chance correct
-- - Otherwise: random based on session score (75-100%)

INSERT INTO session_answers (session_id, question_id, student_answer, is_correct, question_order, created_at)
SELECT
  qs.id AS session_id,
  q.id AS question_id,
  CASE
    WHEN (q.question_type ILIKE '%代數%' OR q.question_type ILIKE '%algebra%')
      THEN CASE WHEN random() < 0.96 THEN q.correct_answer ELSE 'X' END
    ELSE
      CASE WHEN q.rn <= qs.score THEN q.correct_answer ELSE 'X' END
  END AS student_answer,
  CASE
    WHEN (q.question_type ILIKE '%代數%' OR q.question_type ILIKE '%algebra%')
      THEN random() < 0.96
    ELSE
      q.rn <= qs.score
  END AS is_correct,
  q.rn::int AS question_order,
  qs.created_at
FROM quiz_sessions qs
JOIN students s ON s.id = qs.student_id
JOIN parents p ON p.id = s.parent_id
CROSS JOIN LATERAL (
  SELECT q2.id, q2.correct_answer, q2.question_type,
    ROW_NUMBER() OVER (ORDER BY random()) AS rn
  FROM questions q2
  WHERE q2.grade_level = s.grade_level
  LIMIT 10
) q
WHERE p.mobile_number = '99990002'
AND NOT EXISTS (
  SELECT 1 FROM session_answers sa WHERE sa.session_id = qs.id LIMIT 1
);
