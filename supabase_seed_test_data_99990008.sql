-- ============================================================
-- Seed test data for parent mobile: 99990008
-- Email: colin.wong@hkedutech.com
--
-- What this script does:
-- 1) Creates/updates parent 99990008
-- 2) Picks ONE random school from EACH district
-- 3) Creates students per picked school:
--    - 32 x P1
--    - 31 x P2
--    - 37 x P3
--    - 35 x P4
--    - 34 x P5
--    - 43 x P6
--    Student names: Test_1 ... Test_n
--    Avatar style randomized: Boy/Girl
-- 4) Creates practice data:
--    - 200 sessions in English
--    - 200 sessions in Chinese
--    - Each session has 10 answers
--    - Score randomized between 1 and 9 (10% to 90%)
--
-- Safe to rerun:
-- - Existing students under parent 99990008 are removed first
-- - Their related practice records are removed first
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_parent_id UUID;
  v_student_ids UUID[];
BEGIN
  SELECT id
  INTO v_parent_id
  FROM public.parents
  WHERE mobile_number = '99990008'
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(id)
  INTO v_student_ids
  FROM public.students
  WHERE parent_id = v_parent_id;

  IF v_student_ids IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.session_answers') IS NOT NULL
     AND to_regclass('public.quiz_sessions') IS NOT NULL THEN
    EXECUTE '
      DELETE FROM public.session_answers
      WHERE session_id IN (
        SELECT id FROM public.quiz_sessions WHERE student_id = ANY($1)
      )
    ' USING v_student_ids;
  END IF;

  IF to_regclass('public.quiz_sessions') IS NOT NULL THEN
    EXECUTE '
      DELETE FROM public.quiz_sessions
      WHERE student_id = ANY($1)
    ' USING v_student_ids;
  END IF;

  IF to_regclass('public.balance_transactions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.balance_transactions WHERE student_id = ANY($1)' USING v_student_ids;
  END IF;

  IF to_regclass('public.student_balances') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.student_balances WHERE student_id = ANY($1)' USING v_student_ids;
  END IF;

  IF to_regclass('public.student_rank_performance') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.student_rank_performance WHERE student_id = ANY($1)' USING v_student_ids;
  END IF;

  IF to_regclass('public.parent_weights') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.parent_weights WHERE student_id = ANY($1)' USING v_student_ids;
  END IF;

  IF to_regclass('public.question_reports') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.question_reports WHERE student_id = ANY($1)' USING v_student_ids;
  END IF;

  DELETE FROM public.students
  WHERE id = ANY(v_student_ids);
END $$;

INSERT INTO public.parents (mobile_number, email, parent_name)
VALUES ('99990008', 'colin.wong@hkedutech.com', 'Test Parent 99990008')
ON CONFLICT (mobile_number) DO UPDATE
SET
  email = EXCLUDED.email,
  parent_name = EXCLUDED.parent_name;

CREATE TEMP TABLE tmp_seed_99990008_schools ON COMMIT PRESERVE ROWS AS
SELECT DISTINCT ON (district)
  s.id AS school_id,
  s.district,
  COALESCE(s.name_zh, s.name_en) AS school_name
FROM public.schools s
WHERE COALESCE(trim(s.district), '') <> ''
ORDER BY s.district, random();

DO $$
DECLARE
  v_english_count INTEGER;
  v_chinese_count INTEGER;
  v_school_count INTEGER;
BEGIN
  SELECT count(*) INTO v_school_count FROM tmp_seed_99990008_schools;
  IF v_school_count = 0 THEN
    RAISE EXCEPTION 'No schools found. Please seed schools first.';
  END IF;

  SELECT count(*) INTO v_english_count
  FROM public.questions
  WHERE lower(trim(subject)) = 'english';

  SELECT count(*) INTO v_chinese_count
  FROM public.questions
  WHERE lower(trim(subject)) = 'chinese';

  IF v_english_count < 10 THEN
    RAISE EXCEPTION 'Not enough English questions (need >= 10, got %).', v_english_count;
  END IF;
  IF v_chinese_count < 10 THEN
    RAISE EXCEPTION 'Not enough Chinese questions (need >= 10, got %).', v_chinese_count;
  END IF;
END $$;

WITH parent_row AS (
  SELECT id
  FROM public.parents
  WHERE mobile_number = '99990008'
  LIMIT 1
),
grade_counts AS (
  SELECT *
  FROM (
    VALUES
      ('P1'::TEXT, 32),
      ('P2'::TEXT, 31),
      ('P3'::TEXT, 37),
      ('P4'::TEXT, 35),
      ('P5'::TEXT, 34),
      ('P6'::TEXT, 43)
  ) AS g(grade_level, total_count)
),
grade_template AS (
  SELECT
    gc.grade_level,
    gs AS dup_no
  FROM grade_counts gc
  CROSS JOIN LATERAL generate_series(1, gc.total_count) AS gs
),
student_plan AS (
  SELECT
    p.id AS parent_id,
    sch.school_id,
    sch.district,
    sch.school_name,
    g.grade_level,
    g.dup_no,
    row_number() OVER (
      ORDER BY sch.district, sch.school_id, g.grade_level, g.dup_no
    ) AS seq
  FROM parent_row p
  CROSS JOIN tmp_seed_99990008_schools sch
  CROSS JOIN grade_template g
)
INSERT INTO public.students (
  parent_id,
  student_name,
  pin_code,
  avatar_style,
  grade_level,
  school_id,
  created_at
)
SELECT
  sp.parent_id,
  'Test_' || sp.seq,
  crypt('A1B2C3', gen_salt('bf')),
  CASE WHEN random() < 0.5 THEN 'Boy' ELSE 'Girl' END,
  sp.grade_level,
  sp.school_id,
  timezone('UTC', now()) - ((sp.seq % 30)::text || ' days')::interval
FROM student_plan sp;

WITH parent_row AS (
  SELECT id
  FROM public.parents
  WHERE mobile_number = '99990008'
  LIMIT 1
),
students_pool AS (
  SELECT s.id AS student_id, s.grade_level
  FROM public.students s
  JOIN parent_row p ON p.id = s.parent_id
),
session_plan AS (
  SELECT cfg.subject, gs AS seq
  FROM (
    VALUES
      ('English'::TEXT, 200),
      ('Chinese'::TEXT, 200)
  ) AS cfg(subject, total_count)
  CROSS JOIN LATERAL generate_series(1, cfg.total_count) AS gs
),
assigned_sessions AS (
  SELECT
    sp.subject,
    st.student_id,
    st.grade_level,
    (floor(random() * 9)::INT + 1) AS score,
    (
      timezone('UTC', now())
      - (floor(random() * 180)::TEXT || ' days')::interval
      - (random() * interval '23 hours')
    ) AS created_at,
    ('seed-99990008-' || lower(sp.subject) || '-' || gen_random_uuid()::TEXT) AS session_token
  FROM session_plan sp
  JOIN LATERAL (
    SELECT student_id, grade_level
    FROM students_pool
    ORDER BY random()
    LIMIT 1
  ) st ON TRUE
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
    a.student_id,
    a.subject,
    10,
    a.score,
    (300 + floor(random() * 900))::INT,
    a.created_at,
    a.session_token,
    NULL
  FROM assigned_sessions a
  RETURNING id, session_token, score, created_at
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
  s.id AS session_id,
  qpick.id AS question_id,
  CASE WHEN qpick.q_order <= s.score THEN qpick.correct_answer ELSE 'X' END AS student_answer,
  (qpick.q_order <= s.score) AS is_correct,
  qpick.q_order AS question_order,
  s.created_at
FROM inserted_sessions s
JOIN assigned_sessions a
  ON a.session_token = s.session_token
JOIN LATERAL (
  SELECT
    q.id,
    q.correct_answer,
    row_number() OVER (ORDER BY random()) AS q_order
  FROM (
    SELECT q0.id, q0.correct_answer
    FROM public.questions q0
    WHERE lower(trim(q0.subject)) = lower(trim(a.subject))
    ORDER BY
      CASE
        WHEN upper(trim(q0.grade_level)) = upper(trim(a.grade_level)) THEN 0
        ELSE 1
      END,
      random()
    LIMIT 10
  ) q
) qpick ON TRUE;

COMMIT;

-- ============================================================
-- Verification Queries
-- ============================================================

-- Selected random schools (1 per district)
SELECT district, school_name
FROM tmp_seed_99990008_schools
ORDER BY district;

-- Student count by grade
SELECT
  s.grade_level,
  count(*)::INT AS student_count
FROM public.students s
JOIN public.parents p ON p.id = s.parent_id
WHERE p.mobile_number = '99990008'
GROUP BY s.grade_level
ORDER BY s.grade_level;

-- Sessions and score distribution by subject
SELECT
  lower(trim(qs.subject)) AS subject,
  count(*)::INT AS sessions,
  min(qs.score) AS min_score,
  max(qs.score) AS max_score,
  round(avg((qs.score::NUMERIC / NULLIF(qs.questions_attempted, 0)) * 100), 1) AS avg_correct_pct
FROM public.quiz_sessions qs
JOIN public.students s ON s.id = qs.student_id
JOIN public.parents p ON p.id = s.parent_id
WHERE p.mobile_number = '99990008'
  AND lower(trim(qs.subject)) IN ('english', 'chinese')
GROUP BY lower(trim(qs.subject))
ORDER BY subject;

-- Each session should have exactly 10 answers
SELECT
  count(*) FILTER (WHERE answer_count = 10) AS sessions_with_10_answers,
  count(*) FILTER (WHERE answer_count <> 10) AS sessions_not_10_answers
FROM (
  SELECT
    qs.id,
    count(sa.id) AS answer_count
  FROM public.quiz_sessions qs
  LEFT JOIN public.session_answers sa ON sa.session_id = qs.id
  JOIN public.students s ON s.id = qs.student_id
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990008'
    AND lower(trim(qs.subject)) IN ('english', 'chinese')
  GROUP BY qs.id
) t;
