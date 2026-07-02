-- ============================================================
-- Batch 1/3: Parent + Students + Balances
-- Parent: 99990009 / colin.wong@hkedutech.com
-- Students:
--   P1=41, P2=58, P3=30, P4=15 (Test_1 ... Test_144)
-- School assignment:
--   random 1 school per district, then distribute students across picked schools
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Upsert parent
UPDATE public.parents
SET email = 'colin.wong@hkedutech.com'
WHERE mobile_number = '99990009';

INSERT INTO public.parents (mobile_number, email)
SELECT '99990009', 'colin.wong@hkedutech.com'
WHERE NOT EXISTS (
  SELECT 1 FROM public.parents WHERE mobile_number = '99990009'
);

-- 2) Clean previous seed data for this parent (Test_* students + seed sessions)
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

-- 3) Insert students with random boy/girl and district-based school picks
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

COMMIT;

-- Verify student volumes
SELECT
  s.grade_level,
  COUNT(*)::int AS students
FROM public.students s
JOIN public.parents p ON p.id = s.parent_id
WHERE p.mobile_number = '99990009'
  AND s.student_name ~ '^Test_[0-9]+$'
GROUP BY s.grade_level
ORDER BY s.grade_level;
