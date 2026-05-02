-- ============================================================
-- Per-subject grade rankings (nightly batch + parent read)
-- Run in Supabase SQL Editor after backup.
--
-- Changes:
-- 1) `student_grade_rankings.subject` — canonical key: Math | Chinese | English | …
--    Math sessions include legacy `數學` in `quiz_sessions.subject`.
-- 2) UNIQUE (grade_level, student_id, subject) — one row per student per grade per subject.
-- 3) `recalculate_student_grade_rankings()` — recomputes all subject buckets.
-- 4) `get_parent_student_grade_rank(p_student_id, p_subject)` — reads rank for that subject tab.
--
-- After apply: run `recalculate_student_grade_rankings()` once (or wait for cron).
-- Frontend must pass `p_subject` (already aligned with quiz subject keys).
-- ============================================================

-- ---------- 1) Schema: subject column + unique constraint ----------
ALTER TABLE public.student_grade_rankings
  DROP CONSTRAINT IF EXISTS uq_ranking_student_grade;

ALTER TABLE public.student_grade_rankings
  DROP CONSTRAINT IF EXISTS uq_ranking_student_grade_subject;

ALTER TABLE public.student_grade_rankings
  ADD COLUMN IF NOT EXISTS subject TEXT;

DELETE FROM public.student_grade_rankings WHERE true;

ALTER TABLE public.student_grade_rankings
  ALTER COLUMN subject SET NOT NULL;

ALTER TABLE public.student_grade_rankings
  ADD CONSTRAINT uq_ranking_student_grade_subject UNIQUE (grade_level, student_id, subject);

CREATE INDEX IF NOT EXISTS idx_sgr_student_subject
  ON public.student_grade_rankings (student_id, subject);

CREATE INDEX IF NOT EXISTS idx_sgr_grade_subject
  ON public.student_grade_rankings (grade_level, subject);

-- ---------- 2) Batch recompute (per subject_key) ----------
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
    WHERE qs.student_id IS NOT NULL
      AND qs.questions_attempted > 0
      AND trim(coalesce(qs.subject, '')) <> ''
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
  ranked AS (
    SELECT
      w.*,
      CASE WHEN w.is_eligible THEN
        RANK() OVER (
          PARTITION BY w.grade_level, w.subject_key
          ORDER BY w.last_10_avg DESC NULLS LAST, w.student_id
        )
      END AS rk,
      COUNT(*) FILTER (WHERE w.is_eligible) OVER (
        PARTITION BY w.grade_level, w.subject_key
      ) AS tot_elig
    FROM with_elig w
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

-- ---------- 3) Parent read RPC (second arg required for PostgREST) ----------
DROP FUNCTION IF EXISTS public.get_parent_student_grade_rank(uuid);
DROP FUNCTION IF EXISTS public.get_parent_student_grade_rank(uuid, text);

CREATE OR REPLACE FUNCTION public.get_parent_student_grade_rank(
  p_student_id uuid,
  p_subject text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_row public.student_grade_rankings%ROWTYPE;
  v_lookup text;
BEGIN
  v_lookup := CASE
    WHEN p_subject IS NULL OR trim(p_subject) = '' THEN 'Math'
    WHEN lower(trim(p_subject)) IN ('math', '數學') THEN 'Math'
    WHEN lower(trim(p_subject)) = 'chinese' THEN 'Chinese'
    WHEN lower(trim(p_subject)) = 'english' THEN 'English'
    ELSE trim(p_subject)
  END;

  SELECT * INTO v_row
  FROM public.student_grade_rankings
  WHERE student_id = p_student_id
    AND subject = v_lookup
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'has_snapshot', false,
      'error', 'no_ranking_data',
      'subject', v_lookup
    );
  END IF;

  RETURN json_build_object(
    'has_snapshot', true,
    'subject', v_row.subject,
    'calculated_at', v_row.calculated_at,
    'grade_level', v_row.grade_level,
    'student_id', v_row.student_id,
    'student_name', v_row.student_name,
    'lifetime_questions', v_row.lifetime_questions,
    'session_count_in_avg', v_row.session_count_in_avg,
    'last_10_avg_correct_pct', v_row.last_10_avg_correct_pct,
    'rank_in_grade', v_row.rank_in_grade,
    'total_eligible_in_grade', v_row.total_eligible_in_grade,
    'is_eligible', (v_row.lifetime_questions >= 100)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_student_grade_rankings() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_student_grade_rank(uuid, text) TO postgres, anon, authenticated, service_role;
