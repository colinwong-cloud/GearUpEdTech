-- ============================================================
-- Top-up ranking eligibility for seeded parents:
--   99990003, 99990004, 99990005
--
-- Why needed:
-- - Parent dashboard ranking only includes students with
--   >= 100 lifetime questions in the selected subject.
-- - Previous seed scripts distributed sessions randomly across
--   many students, so most students stayed below 100 questions.
--
-- What this script does:
-- 1) For each target student and each subject (Math/English/Chinese),
--    compute missing questions to reach 100.
-- 2) Insert enough 10-question sessions to close the gap
--    (random 10%-90% score each session).
-- 3) Insert 10 session_answers per inserted session.
-- 4) Recalculate student grade rankings snapshot.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_math_count INTEGER;
  v_english_count INTEGER;
  v_chinese_count INTEGER;
  v_target_students INTEGER;
BEGIN
  SELECT count(*) INTO v_math_count
  FROM public.questions
  WHERE lower(trim(subject)) IN ('math', '數學');

  SELECT count(*) INTO v_english_count
  FROM public.questions
  WHERE lower(trim(subject)) = 'english';

  SELECT count(*) INTO v_chinese_count
  FROM public.questions
  WHERE lower(trim(subject)) = 'chinese';

  IF v_math_count < 10 THEN
    RAISE EXCEPTION 'Not enough Math questions (need >= 10, got %).', v_math_count;
  END IF;
  IF v_english_count < 10 THEN
    RAISE EXCEPTION 'Not enough English questions (need >= 10, got %).', v_english_count;
  END IF;
  IF v_chinese_count < 10 THEN
    RAISE EXCEPTION 'Not enough Chinese questions (need >= 10, got %).', v_chinese_count;
  END IF;

  SELECT count(*) INTO v_target_students
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number IN ('99990003', '99990004', '99990005');

  IF v_target_students = 0 THEN
    RAISE EXCEPTION 'No students found under target mobiles 99990003-99990005.';
  END IF;
END $$;

WITH target_students AS (
  SELECT
    p.mobile_number,
    s.id AS student_id,
    s.grade_level
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number IN ('99990003', '99990004', '99990005')
),
subject_list AS (
  SELECT *
  FROM (VALUES ('Math'::TEXT), ('English'::TEXT), ('Chinese'::TEXT)) AS t(subject_key)
),
lifetime AS (
  SELECT
    qs.student_id,
    CASE
      WHEN lower(trim(qs.subject)) IN ('math', '數學') THEN 'Math'
      WHEN lower(trim(qs.subject)) = 'english' THEN 'English'
      WHEN lower(trim(qs.subject)) = 'chinese' THEN 'Chinese'
      ELSE trim(qs.subject)
    END AS subject_key,
    SUM(qs.questions_attempted)::INT AS lifetime_questions
  FROM public.quiz_sessions qs
  WHERE qs.student_id IS NOT NULL
    AND qs.questions_attempted > 0
  GROUP BY
    qs.student_id,
    CASE
      WHEN lower(trim(qs.subject)) IN ('math', '數學') THEN 'Math'
      WHEN lower(trim(qs.subject)) = 'english' THEN 'English'
      WHEN lower(trim(qs.subject)) = 'chinese' THEN 'Chinese'
      ELSE trim(qs.subject)
    END
),
deficits AS (
  SELECT
    ts.mobile_number,
    ts.student_id,
    ts.grade_level,
    sl.subject_key,
    GREATEST(100 - COALESCE(lf.lifetime_questions, 0), 0) AS missing_questions
  FROM target_students ts
  CROSS JOIN subject_list sl
  LEFT JOIN lifetime lf
    ON lf.student_id = ts.student_id
   AND lf.subject_key = sl.subject_key
),
needed_sessions AS (
  SELECT
    d.mobile_number,
    d.student_id,
    d.grade_level,
    d.subject_key,
    CEIL(d.missing_questions / 10.0)::INT AS sessions_needed
  FROM deficits d
  WHERE d.missing_questions > 0
),
session_plan AS (
  SELECT
    ns.mobile_number,
    ns.student_id,
    ns.grade_level,
    ns.subject_key,
    gs.n AS seq_no
  FROM needed_sessions ns
  CROSS JOIN LATERAL generate_series(1, ns.sessions_needed) AS gs(n)
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
    sp.subject_key,
    10,
    (floor(random() * 9)::INT + 1),
    (300 + floor(random() * 900))::INT,
    (
      timezone('UTC', now())
      - (floor(random() * 120)::TEXT || ' days')::interval
      - (random() * interval '23 hours')
    ),
    (
      'rankfill-'
      || sp.mobile_number
      || '-'
      || lower(sp.subject_key)
      || '-'
      || gen_random_uuid()::TEXT
    ),
    NULL
  FROM session_plan sp
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
  qpick.id AS question_id,
  CASE WHEN qpick.q_order <= isess.score THEN qpick.correct_answer ELSE 'X' END AS student_answer,
  (qpick.q_order <= isess.score) AS is_correct,
  qpick.q_order AS question_order,
  isess.created_at
FROM inserted_sessions isess
JOIN public.students st
  ON st.id = isess.student_id
JOIN LATERAL (
  SELECT
    q.id,
    q.correct_answer,
    row_number() OVER (ORDER BY random()) AS q_order
  FROM (
    SELECT q0.id, q0.correct_answer
    FROM public.questions q0
    WHERE
      (
        lower(trim(isess.subject)) = 'math'
        AND lower(trim(q0.subject)) IN ('math', '數學')
      )
      OR (
        lower(trim(isess.subject)) <> 'math'
        AND lower(trim(q0.subject)) = lower(trim(isess.subject))
      )
    ORDER BY
      CASE
        WHEN upper(trim(q0.grade_level)) = upper(trim(st.grade_level)) THEN 0
        ELSE 1
      END,
      random()
    LIMIT 10
  ) q
) qpick ON TRUE;

-- Refresh ranking snapshot so parent dashboard uses latest pool immediately.
SELECT public.recalculate_student_grade_rankings();

COMMIT;

-- ============================================================
-- Verification
-- ============================================================

-- Lifetime questions by target student/subject (should be >= 100 after run)
WITH target_students AS (
  SELECT
    p.mobile_number,
    s.id AS student_id,
    s.student_name,
    s.grade_level
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number IN ('99990003', '99990004', '99990005')
),
norm_lifetime AS (
  SELECT
    ts.mobile_number,
    ts.student_id,
    ts.student_name,
    ts.grade_level,
    CASE
      WHEN lower(trim(qs.subject)) IN ('math', '數學') THEN 'Math'
      WHEN lower(trim(qs.subject)) = 'english' THEN 'English'
      WHEN lower(trim(qs.subject)) = 'chinese' THEN 'Chinese'
      ELSE trim(qs.subject)
    END AS subject_key,
    SUM(qs.questions_attempted)::INT AS lifetime_questions
  FROM target_students ts
  JOIN public.quiz_sessions qs ON qs.student_id = ts.student_id
  WHERE qs.questions_attempted > 0
  GROUP BY
    ts.mobile_number,
    ts.student_id,
    ts.student_name,
    ts.grade_level,
    CASE
      WHEN lower(trim(qs.subject)) IN ('math', '數學') THEN 'Math'
      WHEN lower(trim(qs.subject)) = 'english' THEN 'English'
      WHEN lower(trim(qs.subject)) = 'chinese' THEN 'Chinese'
      ELSE trim(qs.subject)
    END
)
SELECT
  mobile_number,
  student_name,
  grade_level,
  subject_key,
  lifetime_questions
FROM norm_lifetime
WHERE subject_key IN ('Math', 'English', 'Chinese')
ORDER BY mobile_number, student_name, subject_key;

-- Eligible count by grade+subject from ranking snapshot
SELECT
  r.grade_level,
  r.subject,
  COUNT(*) FILTER (WHERE r.lifetime_questions >= 100)::INT AS eligible_students
FROM public.student_grade_rankings r
JOIN public.students s ON s.id = r.student_id
JOIN public.parents p ON p.id = s.parent_id
WHERE p.mobile_number IN ('99990003', '99990004', '99990005')
GROUP BY r.grade_level, r.subject
ORDER BY r.grade_level, r.subject;
