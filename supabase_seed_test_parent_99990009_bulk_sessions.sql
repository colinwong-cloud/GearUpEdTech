-- ============================================================
-- Seed test data for parent 99990009 (NO TEMP TABLES)
-- ============================================================
-- Request:
-- - Parent mobile: 99990009
-- - Parent email : colin.wong@hkedutech.com
-- - Students: Test_1 ... Test_144
--   - P1: 41
--   - P2: 58
--   - P3: 30
--   - P4: 15
-- - School strategy:
--   - randomly pick ONE school per district
--   - assign students across those picked schools
-- - Sessions:
--   - English: 200 sessions
--   - Chinese: 200 sessions
--   - each session: 10 questions
--   - score random 1..9 (10%..90%)
--
-- Idempotent for this seed:
-- - deletes old Test_* students under parent 99990009
-- - deletes old sessions by prefix gearup_seed_99990009_*
--
-- NOTE:
-- - Student PIN is seeded as bcrypt hash of "abc123"
-- - This script intentionally avoids TEMP tables because some Supabase SQL
--   editor contexts reject TEMP syntax.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0) Upsert parent (without ON CONFLICT dependency)
UPDATE public.parents
SET email = 'colin.wong@hkedutech.com'
WHERE mobile_number = '99990009';

INSERT INTO public.parents (mobile_number, email)
SELECT '99990009', 'colin.wong@hkedutech.com'
WHERE NOT EXISTS (
  SELECT 1 FROM public.parents WHERE mobile_number = '99990009'
);

-- 1) Cleanup previous seeded rows for this parent
DELETE FROM public.session_answers sa
USING public.quiz_sessions qs
WHERE sa.session_id = qs.id
  AND (
    qs.session_token LIKE 'gearup_seed_99990009_%'
    OR qs.student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE p.mobile_number = '99990009'
        AND s.student_name ~ '^Test_[0-9]+$'
    )
  );

DELETE FROM public.quiz_sessions qs
WHERE qs.session_token LIKE 'gearup_seed_99990009_%'
   OR qs.student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE p.mobile_number = '99990009'
        AND s.student_name ~ '^Test_[0-9]+$'
   );

DELETE FROM public.balance_transactions bt
WHERE bt.student_id IN (
  SELECT s.id
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990009'
    AND s.student_name ~ '^Test_[0-9]+$'
);

DELETE FROM public.student_balances sb
WHERE sb.student_id IN (
  SELECT s.id
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990009'
    AND s.student_name ~ '^Test_[0-9]+$'
);

DELETE FROM public.students s
WHERE s.id IN (
  SELECT s2.id
  FROM public.students s2
  JOIN public.parents p ON p.id = s2.parent_id
  WHERE p.mobile_number = '99990009'
    AND s2.student_name ~ '^Test_[0-9]+$'
);

-- 2) Insert students Test_1..Test_144 with random Boy/Girl and district-picked schools
WITH parent_row AS (
  SELECT p.id AS parent_id
  FROM public.parents p
  WHERE p.mobile_number = '99990009'
  LIMIT 1
),
districts AS (
  SELECT DISTINCT s.district
  FROM public.schools s
  WHERE s.district IS NOT NULL
    AND trim(s.district) <> ''
),
picked_schools AS (
  SELECT
    d.district,
    ps.id AS school_id,
    row_number() OVER (ORDER BY d.district) AS school_seq
  FROM districts d
  JOIN LATERAL (
    SELECT s2.id
    FROM public.schools s2
    WHERE s2.district = d.district
    ORDER BY random()
    LIMIT 1
  ) ps ON true
),
grade_plan AS (
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
    ((sr.global_idx - 1) % (SELECT COUNT(*) FROM picked_schools) + 1) AS school_seq
  FROM student_rows sr
),
inserted_students AS (
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
    pr.parent_id,
    'Test_' || a.global_idx,
    crypt('abc123', gen_salt('bf')),
    g.avatar_style,
    a.grade_level,
    ps.school_id,
    CASE WHEN g.avatar_style = 'Boy' THEN 'M' ELSE 'F' END
  FROM assigned a
  CROSS JOIN parent_row pr
  JOIN picked_schools ps ON ps.school_seq = a.school_seq
  CROSS JOIN LATERAL (
    SELECT CASE WHEN random() < 0.5 THEN 'Boy' ELSE 'Girl' END AS avatar_style
  ) g
  RETURNING id
)
INSERT INTO public.student_balances (student_id, subject, remaining_questions)
SELECT i.id, subj.subject, 1000
FROM inserted_students i
CROSS JOIN (VALUES ('English'::text), ('Chinese'::text)) AS subj(subject);

-- 3) Guard: ensure there are eligible students per subject (>=10 questions for grade)
DO $$
DECLARE
  v_en_count INT;
  v_zh_count INT;
BEGIN
  SELECT COUNT(*) INTO v_en_count
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990009'
    AND s.student_name ~ '^Test_[0-9]+$'
    AND EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE lower(trim(q.subject)) = 'english'
        AND q.grade_level = s.grade_level
      LIMIT 10
    );

  SELECT COUNT(*) INTO v_zh_count
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990009'
    AND s.student_name ~ '^Test_[0-9]+$'
    AND EXISTS (
      SELECT 1
      FROM public.questions q
      WHERE lower(trim(q.subject)) = 'chinese'
        AND q.grade_level = s.grade_level
      LIMIT 10
    );

  IF v_en_count = 0 THEN
    RAISE EXCEPTION 'No eligible students for English (need >=10 English questions per grade used).';
  END IF;
  IF v_zh_count = 0 THEN
    RAISE EXCEPTION 'No eligible students for Chinese (need >=10 Chinese questions per grade used).';
  END IF;
END $$;

-- 4) Insert 200 English + 200 Chinese sessions and 10 answers/session
WITH seed_students AS (
  SELECT s.id AS student_id, s.grade_level
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990009'
    AND s.student_name ~ '^Test_[0-9]+$'
),
eligible_students AS (
  SELECT ss.student_id, ss.grade_level, subj.subject
  FROM seed_students ss
  CROSS JOIN (VALUES ('English'::text), ('Chinese'::text)) AS subj(subject)
  WHERE (
    SELECT COUNT(*)
    FROM public.questions q
    WHERE lower(trim(q.subject)) = lower(subj.subject)
      AND q.grade_level = ss.grade_level
  ) >= 10
),
subject_plan AS (
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
      FROM eligible_students es
      WHERE lower(es.subject) = lower(sp.subject)
      ORDER BY random()
      LIMIT 1
    ) AS student_id
  FROM subject_plan sp
  CROSS JOIN LATERAL generate_series(1, sp.session_count) AS gs(n)
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
    sr.subject,
    10,
    (1 + floor(random() * 9))::int, -- 10%..90%
    (240 + floor(random() * 660))::int,
    timezone('UTC', now())
      - (floor(random() * 90)::text || ' days')::interval
      - (random() * interval '23 hours'),
    'gearup_seed_99990009_' || lower(sr.subject) || '_' || gen_random_uuid()::text,
    NULL
  FROM session_rows sr
  RETURNING id, student_id, subject, score, created_at
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
  isess.id AS session_id,
  qn.id AS question_id,
  CASE WHEN qn.ord <= isess.score THEN qn.correct_answer ELSE 'X' END AS student_answer,
  (qn.ord <= isess.score) AS is_correct,
  qn.ord AS question_order,
  isess.created_at
FROM ins_sessions isess
JOIN public.students st ON st.id = isess.student_id
JOIN LATERAL (
  SELECT
    q.id,
    q.correct_answer,
    row_number() OVER (ORDER BY md5(isess.id::text || q.id::text)) AS ord
  FROM public.questions q
  WHERE lower(trim(q.subject)) = lower(isess.subject)
    AND q.grade_level = st.grade_level
  LIMIT 10
) qn ON true;

COMMIT;

-- ============================================================
-- Verification queries
-- ============================================================

-- Parent + student total
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

-- District coverage check (should be exactly 1 picked school per district)
SELECT
  sc.district,
  COUNT(DISTINCT s.school_id)::int AS distinct_schools_used,
  COUNT(*)::int AS students
FROM public.students s
JOIN public.parents p ON p.id = s.parent_id
JOIN public.schools sc ON sc.id = s.school_id
WHERE p.mobile_number = '99990009'
  AND s.student_name ~ '^Test_[0-9]+$'
GROUP BY sc.district
ORDER BY sc.district;

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
