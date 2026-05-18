-- ============================================================
-- Seed test data for parent 99990009 (idempotent)
-- Request:
-- - Parent: mobile 99990009, email colin.wong@hkedutech.com
-- - Students: Test_1 ... Test_n
-- - Grade counts: P1=41, P2=58, P3=30, P4=15
-- - School selection: random 1 school per district, then assign students across picked schools
-- - Sessions: 200 English + 200 Chinese
-- - Each session: 10 questions, random score 10%~90% (1~9 / 10)
--
-- Notes:
-- - PIN for seeded students is fixed to: abc123 (bcrypt hash stored)
-- - Uses session_token prefix: gearup_seed_99990009_
-- - Safe to re-run: prior seeded students/sessions for this parent are removed first
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------
-- 0) Upsert parent
-- ---------------------------
CREATE TEMP TABLE tmp_seed_parent_id AS
WITH upsert_parent AS (
  INSERT INTO public.parents (mobile_number, email)
  VALUES ('99990009', 'colin.wong@hkedutech.com')
  ON CONFLICT (mobile_number)
  DO UPDATE SET email = EXCLUDED.email
  RETURNING id
)
SELECT id FROM upsert_parent;

-- If ON CONFLICT path did not return (some DB versions/permissions edge),
-- fallback select by mobile.
INSERT INTO tmp_seed_parent_id
SELECT p.id
FROM public.parents p
WHERE p.mobile_number = '99990009'
  AND NOT EXISTS (SELECT 1 FROM tmp_seed_parent_id);

-- ---------------------------
-- 1) Clean previous seed data for this parent
-- ---------------------------
CREATE TEMP TABLE tmp_existing_seed_students AS
SELECT s.id
FROM public.students s
JOIN public.parents p ON p.id = s.parent_id
WHERE p.mobile_number = '99990009'
  AND s.student_name ~ '^Test_[0-9]+$';

DELETE FROM public.session_answers sa
USING public.quiz_sessions qs
WHERE sa.session_id = qs.id
  AND (
    qs.session_token LIKE 'gearup_seed_99990009_%'
    OR qs.student_id IN (SELECT id FROM tmp_existing_seed_students)
  );

DELETE FROM public.quiz_sessions qs
WHERE qs.session_token LIKE 'gearup_seed_99990009_%'
   OR qs.student_id IN (SELECT id FROM tmp_existing_seed_students);

DELETE FROM public.balance_transactions bt
WHERE bt.student_id IN (SELECT id FROM tmp_existing_seed_students);

DELETE FROM public.student_balances sb
WHERE sb.student_id IN (SELECT id FROM tmp_existing_seed_students);

DELETE FROM public.students s
WHERE s.id IN (SELECT id FROM tmp_existing_seed_students);

-- ---------------------------
-- 2) Pick one random school per district
-- ---------------------------
CREATE TEMP TABLE tmp_picked_schools AS
SELECT
  d.district,
  s.id AS school_id,
  row_number() OVER (ORDER BY d.district) AS school_seq
FROM (
  SELECT DISTINCT district
  FROM public.schools
  WHERE district IS NOT NULL
    AND trim(district) <> ''
) d
JOIN LATERAL (
  SELECT id
  FROM public.schools s2
  WHERE s2.district = d.district
  ORDER BY random()
  LIMIT 1
) s ON true;

-- ---------------------------
-- 3) Insert students (Test_1..Test_144)
-- ---------------------------
CREATE TEMP TABLE tmp_seed_students (
  student_id UUID PRIMARY KEY,
  grade_level TEXT NOT NULL
);

WITH grade_plan AS (
  SELECT * FROM (VALUES
    (1, 'P1'::text, 41),
    (2, 'P2'::text, 58),
    (3, 'P3'::text, 30),
    (4, 'P4'::text, 15)
  ) AS t(sort_key, grade_level, student_count)
),
student_rows AS (
  SELECT
    gp.grade_level,
    row_number() OVER (ORDER BY gp.sort_key, gs.n) AS global_idx
  FROM grade_plan gp
  CROSS JOIN LATERAL generate_series(1, gp.student_count) AS gs(n)
),
assigned AS (
  SELECT
    sr.global_idx,
    sr.grade_level,
    ((sr.global_idx - 1) % (SELECT COUNT(*) FROM tmp_picked_schools) + 1) AS school_seq
  FROM student_rows sr
),
ins AS (
  INSERT INTO public.students (
    parent_id,
    student_name,
    pin_code,
    avatar_style,
    grade_level,
    school_id,
    gender
  )
  SELECT
    (SELECT id FROM tmp_seed_parent_id LIMIT 1) AS parent_id,
    'Test_' || a.global_idx AS student_name,
    crypt('abc123', gen_salt('bf')) AS pin_code,
    g.avatar_style,
    a.grade_level,
    ps.school_id,
    CASE WHEN g.avatar_style = 'Boy' THEN 'M' ELSE 'F' END AS gender
  FROM assigned a
  JOIN tmp_picked_schools ps ON ps.school_seq = a.school_seq
  CROSS JOIN LATERAL (
    SELECT CASE WHEN random() < 0.5 THEN 'Boy' ELSE 'Girl' END AS avatar_style
  ) g
  RETURNING id, grade_level
)
INSERT INTO tmp_seed_students (student_id, grade_level)
SELECT id, grade_level
FROM ins;

-- Optional balances for English/Chinese to make seeded students immediately usable in UI.
INSERT INTO public.student_balances (student_id, subject, remaining_questions)
SELECT ss.student_id, subj.subject, 1000
FROM tmp_seed_students ss
CROSS JOIN (VALUES ('English'::text), ('Chinese'::text)) AS subj(subject);

-- ---------------------------
-- 4) Build eligibility (must have >=10 questions for grade+subject)
-- ---------------------------
CREATE TEMP TABLE tmp_eligible_seed_students AS
SELECT
  ss.student_id,
  ss.grade_level,
  sp.subject
FROM tmp_seed_students ss
CROSS JOIN (VALUES ('English'::text), ('Chinese'::text)) AS sp(subject)
JOIN LATERAL (
  SELECT COUNT(*) AS q_count
  FROM public.questions q
  WHERE lower(trim(q.subject)) = lower(sp.subject)
    AND q.grade_level = ss.grade_level
) qc ON true
WHERE qc.q_count >= 10;

DO $$
DECLARE
  v_en_count INT;
  v_zh_count INT;
BEGIN
  SELECT COUNT(*) INTO v_en_count
  FROM tmp_eligible_seed_students
  WHERE lower(subject) = 'english';

  SELECT COUNT(*) INTO v_zh_count
  FROM tmp_eligible_seed_students
  WHERE lower(subject) = 'chinese';

  IF v_en_count = 0 THEN
    RAISE EXCEPTION 'No eligible seeded students for English (need >=10 English questions per student grade).';
  END IF;
  IF v_zh_count = 0 THEN
    RAISE EXCEPTION 'No eligible seeded students for Chinese (need >=10 Chinese questions per student grade).';
  END IF;
END $$;

-- ---------------------------
-- 5) Insert 200 sessions per subject
-- ---------------------------
CREATE TEMP TABLE tmp_seed_sessions (
  session_id UUID PRIMARY KEY,
  student_id UUID NOT NULL,
  subject TEXT NOT NULL,
  score INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

WITH subject_plan AS (
  SELECT * FROM (VALUES
    ('English'::text, 200),
    ('Chinese'::text, 200)
  ) AS t(subject, session_count)
),
session_rows AS (
  SELECT
    sp.subject,
    gs.n AS seq_no,
    (
      SELECT es.student_id
      FROM tmp_eligible_seed_students es
      WHERE lower(es.subject) = lower(sp.subject)
      ORDER BY random()
      LIMIT 1
    ) AS picked_student_id
  FROM subject_plan sp
  CROSS JOIN LATERAL generate_series(1, sp.session_count) AS gs(n)
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
    sr.picked_student_id,
    sr.subject,
    10,
    (1 + floor(random() * 9))::int AS score, -- 10%~90%
    (240 + floor(random() * 660))::int AS time_spent_seconds,
    timezone('UTC', now())
      - (floor(random() * 90)::text || ' days')::interval
      - (random() * interval '23 hours'),
    'gearup_seed_99990009_' || lower(sr.subject) || '_' || gen_random_uuid()::text,
    NULL
  FROM session_rows sr
  RETURNING id, student_id, subject, score, created_at
)
INSERT INTO tmp_seed_sessions (session_id, student_id, subject, score, created_at)
SELECT id, student_id, subject, score, created_at
FROM ins;

-- ---------------------------
-- 6) Insert 10 answers per session
-- ---------------------------
INSERT INTO public.session_answers (
  session_id,
  question_id,
  student_answer,
  is_correct,
  question_order,
  created_at
)
SELECT
  ts.session_id,
  qn.id AS question_id,
  CASE WHEN qn.ord <= ts.score THEN qn.correct_answer ELSE 'X' END AS student_answer,
  (qn.ord <= ts.score) AS is_correct,
  qn.ord AS question_order,
  ts.created_at
FROM tmp_seed_sessions ts
JOIN public.students st ON st.id = ts.student_id
JOIN LATERAL (
  SELECT
    q.id,
    q.correct_answer,
    row_number() OVER (ORDER BY md5(ts.session_id::text || q.id::text)) AS ord
  FROM public.questions q
  WHERE lower(trim(q.subject)) = lower(ts.subject)
    AND q.grade_level = st.grade_level
  LIMIT 10
) qn ON true;

COMMIT;

-- ---------------------------
-- Verify summary
-- ---------------------------

-- Parent + student volume
SELECT
  p.mobile_number,
  p.email,
  COUNT(*)::int AS student_count
FROM public.parents p
JOIN public.students s ON s.parent_id = p.id
WHERE p.mobile_number = '99990009'
GROUP BY p.mobile_number, p.email;

-- Grade distribution
SELECT
  s.grade_level,
  COUNT(*)::int AS students
FROM public.students s
JOIN public.parents p ON p.id = s.parent_id
WHERE p.mobile_number = '99990009'
  AND s.student_name ~ '^Test_[0-9]+$'
GROUP BY s.grade_level
ORDER BY s.grade_level;

-- Picked schools (one per district)
SELECT
  district,
  school_id
FROM tmp_picked_schools
ORDER BY district;

-- Session summary by subject
SELECT
  lower(trim(qs.subject)) AS subject,
  COUNT(*)::int AS sessions,
  ROUND(AVG((qs.score::numeric / NULLIF(qs.questions_attempted, 0)) * 100), 1) AS avg_pct,
  ROUND(MIN((qs.score::numeric / NULLIF(qs.questions_attempted, 0)) * 100), 1) AS min_pct,
  ROUND(MAX((qs.score::numeric / NULLIF(qs.questions_attempted, 0)) * 100), 1) AS max_pct
FROM public.quiz_sessions qs
JOIN public.students s ON s.id = qs.student_id
JOIN public.parents p ON p.id = s.parent_id
WHERE p.mobile_number = '99990009'
  AND qs.session_token LIKE 'gearup_seed_99990009_%'
GROUP BY lower(trim(qs.subject))
ORDER BY subject;
