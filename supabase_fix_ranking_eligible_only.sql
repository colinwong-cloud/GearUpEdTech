-- ============================================================
-- Fix: grade ranking must rank ONLY among eligible students
-- (students with >= 100 lifetime questions in that subject).
--
-- Bug: recalculate_student_grade_rankings() computed RANK() over ALL
-- students in the grade+subject (eligible AND ineligible), while
-- total_eligible_in_grade counted only eligible students. When an
-- ineligible peer had a higher recent average, an eligible student's
-- rank_in_grade could exceed total_eligible_in_grade — e.g. the parent
-- dashboard showed "排第 5 名（共 1 人）" (rank 5 of 1).
--
-- Fix: compute both RANK() and the cohort COUNT over the eligible-only
-- subset, then LEFT JOIN back. Guarantees rank_in_grade <= total.
-- Keeps subject normalization and the 999 test-mobile exclusion.
--
-- After apply, re-run: SELECT public.recalculate_student_grade_rankings();
-- (or wait for the nightly cron) to rewrite the snapshot.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.recalculate_student_grade_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL statement_timeout = '5min';
  DELETE FROM public.student_grade_rankings WHERE true;

  WITH sessions_norm AS (
    SELECT
      qs.student_id,
      qs.questions_attempted,
      qs.score,
      qs.created_at,
      CASE
        WHEN lower(trim(qs.subject)) IN ('math', '數學') THEN 'Math'
        WHEN lower(trim(qs.subject)) = 'chinese' THEN 'Chinese'
        WHEN lower(trim(qs.subject)) = 'english' THEN 'English'
        ELSE trim(qs.subject)
      END AS subject_key
    FROM public.quiz_sessions qs
    INNER JOIN public.students st ON st.id = qs.student_id
    INNER JOIN public.parents p ON p.id = st.parent_id
    WHERE qs.student_id IS NOT NULL
      AND qs.questions_attempted > 0
      AND trim(coalesce(qs.subject, '')) <> ''
      AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '999%')
  ),
  ranked_sessions AS (
    SELECT
      sn.student_id,
      sn.subject_key,
      (sn.score::numeric / NULLIF(sn.questions_attempted, 0)) * 100 AS rate_pct,
      row_number() OVER (
        PARTITION BY sn.student_id, sn.subject_key
        ORDER BY sn.created_at DESC
      ) AS rn
    FROM sessions_norm sn
  ),
  session_agg AS (
    SELECT
      student_id,
      subject_key,
      (COUNT(*) FILTER (WHERE rn <= 10))::int AS session_count_in_avg,
      CASE WHEN COUNT(*) FILTER (WHERE rn <= 10) > 0
        THEN ROUND((AVG(rate_pct) FILTER (WHERE rn <= 10))::numeric, 4)
        ELSE NULL
      END AS last_10_avg
    FROM ranked_sessions
    GROUP BY student_id, subject_key
  ),
  lifetime AS (
    SELECT
      sn.student_id,
      sn.subject_key,
      SUM(sn.questions_attempted)::int AS lifetime_questions
    FROM sessions_norm sn
    GROUP BY sn.student_id, sn.subject_key
  ),
  pairs AS (
    SELECT DISTINCT student_id, subject_key
    FROM sessions_norm
  ),
  per_student AS (
    SELECT
      s.id AS student_id,
      s.grade_level,
      s.student_name,
      p.subject_key,
      COALESCE(l.lifetime_questions, 0) AS lifetime_questions,
      COALESCE(sa.session_count_in_avg, 0) AS session_count_in_avg,
      sa.last_10_avg
    FROM pairs p
    JOIN public.students s ON s.id = p.student_id
    LEFT JOIN session_agg sa
      ON sa.student_id = p.student_id AND sa.subject_key = p.subject_key
    LEFT JOIN lifetime l
      ON l.student_id = p.student_id AND l.subject_key = p.subject_key
  ),
  with_elig AS (
    SELECT
      ps.*,
      (ps.lifetime_questions >= 100) AS is_eligible
    FROM per_student ps
  ),
  -- Rank + cohort count over ELIGIBLE students only, so rank_in_grade
  -- can never exceed total_eligible_in_grade.
  ranked_eligible AS (
    SELECT
      w.student_id,
      w.grade_level,
      w.subject_key,
      RANK() OVER (
        PARTITION BY w.grade_level, w.subject_key
        ORDER BY w.last_10_avg DESC NULLS LAST, w.student_id
      ) AS rk,
      COUNT(*) OVER (
        PARTITION BY w.grade_level, w.subject_key
      ) AS tot_elig
    FROM with_elig w
    WHERE w.is_eligible
  ),
  ranked AS (
    SELECT
      w.*,
      re.rk,
      COALESCE(re.tot_elig, 0) AS tot_elig
    FROM with_elig w
    LEFT JOIN ranked_eligible re
      ON re.student_id = w.student_id
     AND re.grade_level = w.grade_level
     AND re.subject_key = w.subject_key
  )
  INSERT INTO public.student_grade_rankings (
    calculated_at,
    grade_level,
    student_id,
    student_name,
    subject,
    lifetime_questions,
    session_count_in_avg,
    last_10_avg_correct_pct,
    rank_in_grade,
    total_eligible_in_grade
  )
  SELECT
    now(),
    r.grade_level,
    r.student_id,
    r.student_name,
    r.subject_key,
    r.lifetime_questions,
    r.session_count_in_avg,
    r.last_10_avg,
    CASE WHEN r.is_eligible THEN r.rk::integer ELSE NULL END,
    COALESCE(r.tot_elig, 0)
  FROM ranked r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_student_grade_rankings() TO postgres, anon, authenticated, service_role;

COMMIT;

-- Rewrite the snapshot immediately (safe to run any time; nightly cron also runs it):
-- SELECT public.recalculate_student_grade_rankings();
