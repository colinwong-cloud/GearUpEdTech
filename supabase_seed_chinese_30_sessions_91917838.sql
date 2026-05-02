-- ============================================================
-- Seed: 30 Chinese practice sessions × 10 questions each
-- Parent mobile: 91917838 | Students: Loklok, Heihei (name case-insensitive)
-- Each session: 10 questions, score 4–9 → 40%–90% correct rate
--
-- Matches schema: quiz_sessions has session_token (UNIQUE), session_practice_summary,
-- hkt_practice_date (nullable); NO session_practice_summary_parent column.
--
-- Idempotent: DELETE quiz_sessions WHERE session_token LIKE 'gearup_seed_chinese_30-%'
-- (answers cascade via explicit delete first for FK order).
-- No ALTER TABLE / no new tables.
--
-- Preconditions:
--   - ≥10 questions per student grade: lower(trim(subject)) = 'chinese'
--
-- Run: Supabase → SQL Editor
-- ============================================================

BEGIN;

DELETE FROM public.session_answers sa
USING public.quiz_sessions qs
WHERE sa.session_id = qs.id
  AND qs.session_token LIKE 'gearup_seed_chinese_30-%';

DELETE FROM public.quiz_sessions
WHERE session_token LIKE 'gearup_seed_chinese_30-%';

WITH targets AS (
  SELECT s.id AS student_id, s.grade_level, s.student_name
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '91917838'
    AND lower(trim(s.student_name)) IN ('loklok', 'heihei')
),
ins AS (
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
    t.student_id,
    'Chinese',
    10,
    LEAST(9, GREATEST(4, floor(4 + random() * 6)::int)),
    (420 + floor(random() * 480))::int,
    (timezone('UTC', now()))
      - ((gs.n - 1) * interval '2 days')
      - (random() * interval '45 minutes'),
    'gearup_seed_chinese_30-' || gen_random_uuid()::text,
    NULL
  FROM targets t
  CROSS JOIN generate_series(1, 30) AS gs(n)
  RETURNING id, student_id, score, created_at
)
INSERT INTO public.session_answers (session_id, question_id, student_answer, is_correct, question_order, created_at)
SELECT
  ins.id,
  qn.id,
  CASE WHEN qn.ord <= ins.score THEN qn.correct_answer ELSE 'X' END,
  (qn.ord <= ins.score),
  qn.ord,
  ins.created_at
FROM ins
JOIN public.students st ON st.id = ins.student_id
JOIN LATERAL (
  SELECT q2.id, q2.correct_answer,
    row_number() OVER (ORDER BY md5(ins.id::text || q2.id::text)) AS ord
  FROM public.questions q2
  WHERE lower(trim(q2.subject)) = 'chinese'
    AND q2.grade_level = st.grade_level
  LIMIT 10
) qn ON true;

COMMIT;

-- Verify (2 students × 30 sessions; pct 40–90 per session)
SELECT
  s.student_name,
  COUNT(*)::int AS sessions,
  ROUND(AVG(CASE WHEN qs.questions_attempted > 0
    THEN (qs.score::numeric / qs.questions_attempted) * 100 END), 1) AS avg_correct_pct,
  ROUND(MIN(CASE WHEN qs.questions_attempted > 0
    THEN (qs.score::numeric / qs.questions_attempted) * 100 END), 1) AS min_pct,
  ROUND(MAX(CASE WHEN qs.questions_attempted > 0
    THEN (qs.score::numeric / qs.questions_attempted) * 100 END), 1) AS max_pct
FROM public.quiz_sessions qs
JOIN public.students s ON s.id = qs.student_id
WHERE qs.session_token LIKE 'gearup_seed_chinese_30-%'
GROUP BY s.id, s.student_name
ORDER BY s.student_name;
