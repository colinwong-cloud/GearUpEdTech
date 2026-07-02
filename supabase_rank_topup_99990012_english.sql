-- ============================================================
-- Ranking top-up batch
-- Target mobile: 99990012
-- Subject: English
-- Goal: ensure each student under this parent reaches >= 100
--       lifetime English questions_attempted.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_question_count INT;
  v_target_students INT;
BEGIN
  SELECT COUNT(*) INTO v_question_count
  FROM public.questions
  WHERE lower(trim(subject)) = 'english';

  IF v_question_count < 10 THEN
    RAISE EXCEPTION 'Not enough English questions (need >= 10, got %).', v_question_count;
  END IF;

  SELECT COUNT(*) INTO v_target_students
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990012';

  IF v_target_students = 0 THEN
    RAISE EXCEPTION 'No students found under mobile 99990012.';
  END IF;
END $$;

WITH target_students AS (
  SELECT
    p.mobile_number,
    s.id AS student_id,
    s.grade_level
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990012'
),
lifetime AS (
  SELECT
    qs.student_id,
    SUM(qs.questions_attempted)::INT AS lifetime_questions
  FROM public.quiz_sessions qs
  JOIN target_students ts ON ts.student_id = qs.student_id
  WHERE qs.questions_attempted > 0
    AND lower(trim(qs.subject)) = 'english'
  GROUP BY qs.student_id
),
deficits AS (
  SELECT
    ts.mobile_number,
    ts.student_id,
    ts.grade_level,
    GREATEST(100 - COALESCE(lf.lifetime_questions, 0), 0) AS missing_questions
  FROM target_students ts
  LEFT JOIN lifetime lf
    ON lf.student_id = ts.student_id
),
session_plan AS (
  SELECT
    d.mobile_number,
    d.student_id,
    d.grade_level,
    gs.n AS seq_no
  FROM deficits d
  CROSS JOIN LATERAL generate_series(1, CEIL(d.missing_questions / 10.0)::INT) AS gs(n)
  WHERE d.missing_questions > 0
),
inserted_sessions AS (
  INSERT INTO public.quiz_sessions (
    student_id,
    subject,
    questions_attempted,
    score,
    time_spent_seconds,
    created_at,
    session_token,
    session_practice_summary
  )
  SELECT
    sp.student_id,
    'English',
    10,
    (floor(random() * 9)::INT + 1),
    (300 + floor(random() * 900))::INT,
    timezone('UTC', now())
      - (floor(random() * 120)::TEXT || ' days')::interval
      - (random() * interval '23 hours'),
    'rankfill-99990012-english-' || gen_random_uuid()::TEXT,
    NULL
  FROM session_plan sp
  RETURNING id, student_id, score, created_at
)
INSERT INTO public.session_answers (
  session_id,
  question_id,
  student_answer,
  is_correct,
  question_order,
  created_at
)
SELECT
  isess.id,
  qpick.id,
  CASE WHEN qpick.q_order <= isess.score THEN qpick.correct_answer ELSE 'X' END,
  (qpick.q_order <= isess.score),
  qpick.q_order,
  isess.created_at
FROM inserted_sessions isess
JOIN public.students st ON st.id = isess.student_id
JOIN LATERAL (
  SELECT
    q.id,
    q.correct_answer,
    row_number() OVER (ORDER BY md5(isess.id::TEXT || q.id::TEXT)) AS q_order
  FROM (
    SELECT q0.id, q0.correct_answer
    FROM public.questions q0
    WHERE lower(trim(q0.subject)) = 'english'
    ORDER BY
      CASE WHEN upper(trim(q0.grade_level)) = upper(trim(st.grade_level)) THEN 0 ELSE 1 END,
      md5(isess.id::TEXT || q0.id::TEXT)
    LIMIT 10
  ) q
) qpick ON TRUE;

COMMIT;

-- Verification (this mobile + this subject)
WITH target_students AS (
  SELECT s.id AS student_id
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990012'
),
lifetime AS (
  SELECT
    ts.student_id,
    COALESCE((
      SELECT SUM(qs.questions_attempted)::INT
      FROM public.quiz_sessions qs
      WHERE qs.student_id = ts.student_id
        AND qs.questions_attempted > 0
        AND lower(trim(qs.subject)) = 'english'
    ), 0) AS lifetime_questions
  FROM target_students ts
)
SELECT
  '99990012' AS mobile_number,
  'English' AS subject,
  COUNT(*)::INT AS students_total,
  SUM(CASE WHEN lifetime_questions >= 100 THEN 1 ELSE 0 END)::INT AS eligible_students,
  MIN(lifetime_questions)::INT AS min_questions,
  MAX(lifetime_questions)::INT AS max_questions
FROM lifetime;
