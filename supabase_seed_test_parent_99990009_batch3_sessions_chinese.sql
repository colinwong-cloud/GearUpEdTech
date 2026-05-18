-- ============================================================
-- Batch 3/3: Seed Chinese sessions + answers
-- 200 sessions, each 10 questions, random score 1..9 (10%..90%)
-- Requires Batch 1 to be completed first.
-- ============================================================

BEGIN;

-- Remove previously seeded Chinese sessions (safe re-run)
DELETE FROM public.session_answers sa
USING public.quiz_sessions qs
WHERE sa.session_id = qs.id
  AND qs.session_token LIKE 'gearup_seed_99990009_chinese_%';

DELETE FROM public.quiz_sessions
WHERE session_token LIKE 'gearup_seed_99990009_chinese_%';

-- Guard: ensure at least one eligible seeded student has >=10 Chinese questions
DO $$
DECLARE
  v_eligible_count INT;
BEGIN
  SELECT COUNT(*) INTO v_eligible_count
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990009'
    AND s.student_name ~ '^Test_[0-9]+$'
    AND (
      SELECT COUNT(*)
      FROM public.questions q
      WHERE lower(trim(q.subject)) = 'chinese'
        AND q.grade_level = s.grade_level
    ) >= 10;

  IF v_eligible_count = 0 THEN
    RAISE EXCEPTION 'No eligible students for Chinese (need >=10 Chinese questions per grade used).';
  END IF;
END $$;

WITH seed_students AS (
  SELECT s.id AS student_id, s.grade_level
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990009'
    AND s.student_name ~ '^Test_[0-9]+$'
),
eligible_students AS (
  SELECT ss.student_id, ss.grade_level
  FROM seed_students ss
  WHERE (
    SELECT COUNT(*)
    FROM public.questions q
    WHERE lower(trim(q.subject)) = 'chinese'
      AND q.grade_level = ss.grade_level
  ) >= 10
),
session_rows AS (
  SELECT
    gs.n AS seq_no,
    (
      SELECT es.student_id
      FROM eligible_students es
      ORDER BY random()
      LIMIT 1
    ) AS student_id
  FROM generate_series(1, 200) AS gs(n)
),
ins_sessions AS (
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
    sr.student_id,
    'Chinese',
    10,
    (1 + floor(random() * 9))::int,
    (240 + floor(random() * 660))::int,
    timezone('UTC', now())
      - (floor(random() * 90)::text || ' days')::interval
      - (random() * interval '23 hours'),
    'gearup_seed_99990009_chinese_' || gen_random_uuid()::text,
    NULL
  FROM session_rows sr
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
  qn.id,
  CASE WHEN qn.ord <= isess.score THEN qn.correct_answer ELSE 'X' END,
  (qn.ord <= isess.score),
  qn.ord,
  isess.created_at
FROM ins_sessions isess
JOIN public.students st ON st.id = isess.student_id
JOIN LATERAL (
  SELECT
    q.id,
    q.correct_answer,
    row_number() OVER (ORDER BY md5(isess.id::text || q.id::text)) AS ord
  FROM public.questions q
  WHERE lower(trim(q.subject)) = 'chinese'
    AND q.grade_level = st.grade_level
  LIMIT 10
) qn ON true;

COMMIT;

-- Verify + combined overview
SELECT
  COUNT(*)::int AS chinese_sessions,
  ROUND(MIN((score::numeric / NULLIF(questions_attempted, 0)) * 100), 1) AS min_pct,
  ROUND(MAX((score::numeric / NULLIF(questions_attempted, 0)) * 100), 1) AS max_pct
FROM public.quiz_sessions
WHERE session_token LIKE 'gearup_seed_99990009_chinese_%';

SELECT
  lower(trim(subject)) AS subject,
  COUNT(*)::int AS sessions
FROM public.quiz_sessions
WHERE session_token LIKE 'gearup_seed_99990009_%'
GROUP BY lower(trim(subject))
ORDER BY subject;
