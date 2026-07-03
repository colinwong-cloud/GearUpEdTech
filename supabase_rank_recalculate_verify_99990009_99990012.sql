-- ============================================================
-- Final step after all 8 top-up batches are executed:
-- 1) Recalculate ranking snapshot immediately
-- 2) Verify eligibility coverage for 99990009~99990012
-- 3) Verify snapshot rows exist for English/Chinese
-- ============================================================

BEGIN;
SELECT public.recalculate_student_grade_rankings();
COMMIT;

-- ------------------------------------------------------------
-- Verification A: lifetime questions + eligibility (raw sessions)
-- ------------------------------------------------------------
WITH target_students AS (
  SELECT
    p.mobile_number,
    s.id AS student_id,
    s.student_name,
    s.grade_level
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number IN ('99990009', '99990010', '99990011', '99990012')
),
subject_list AS (
  SELECT * FROM (VALUES ('English'::TEXT), ('Chinese'::TEXT)) AS t(subject_key)
),
lifetime AS (
  SELECT
    ts.mobile_number,
    ts.student_id,
    ts.student_name,
    ts.grade_level,
    sl.subject_key,
    COALESCE((
      SELECT SUM(qs.questions_attempted)::INT
      FROM public.quiz_sessions qs
      WHERE qs.student_id = ts.student_id
        AND qs.questions_attempted > 0
        AND lower(trim(qs.subject)) = lower(sl.subject_key)
    ), 0) AS lifetime_questions
  FROM target_students ts
  CROSS JOIN subject_list sl
)
SELECT
  mobile_number,
  subject_key AS subject,
  COUNT(*)::INT AS students_total,
  SUM(CASE WHEN lifetime_questions >= 100 THEN 1 ELSE 0 END)::INT AS eligible_students,
  MIN(lifetime_questions)::INT AS min_questions,
  MAX(lifetime_questions)::INT AS max_questions
FROM lifetime
GROUP BY mobile_number, subject_key
ORDER BY mobile_number, subject_key;

-- ------------------------------------------------------------
-- Verification B: ranking snapshot rows now available
-- ------------------------------------------------------------
WITH target_students AS (
  SELECT
    p.mobile_number,
    s.id AS student_id,
    s.grade_level
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number IN ('99990009', '99990010', '99990011', '99990012')
)
SELECT
  ts.mobile_number,
  r.subject,
  ts.grade_level,
  COUNT(*)::INT AS snapshot_rows,
  SUM(CASE WHEN r.rank_in_grade IS NOT NULL THEN 1 ELSE 0 END)::INT AS ranked_rows
FROM public.student_grade_rankings r
JOIN target_students ts ON ts.student_id = r.student_id
WHERE r.subject IN ('English', 'Chinese')
GROUP BY ts.mobile_number, r.subject, ts.grade_level
ORDER BY ts.mobile_number, r.subject, ts.grade_level;
