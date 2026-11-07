-- Parent-callable peer ranking for「比較地區」「比較學校」scope (Soft #245 Phase 1 · Soft #250 pick-any).
-- Mirrors tutor_student_peer_comparison last-10 session average, subject + grade filters.
-- Optional p_district / p_school_id: null or blank → student's own school district / school_id (compat).
-- SECURITY DEFINER: verifies mobile + PIN + parent paid + student ownership before returning data.
--
-- **Deploy:** Apply in Supabase SQL Editor when approved (shared-db preview = prod). Do not run from agent without owner sign-off.

BEGIN;

DROP FUNCTION IF EXISTS public.parent_check_ranking_peer(text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.parent_check_ranking_peer(text, text, uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.parent_check_ranking_peer(
  p_mobile_number text,
  p_pin_code text,
  p_student_id uuid,
  p_subject text,
  p_scope text,
  p_district text DEFAULT NULL,
  p_school_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
STABLE
AS $$
DECLARE
  v_mobile text := trim(coalesce(p_mobile_number, ''));
  v_pin text := trim(coalesce(p_pin_code, ''));
  v_scope text := lower(trim(coalesce(p_scope, '')));
  v_subject text;
  v_parent_id uuid;
  v_paid boolean := false;
  v_grade text;
  v_school_id uuid;
  v_district text;
  v_compare_district text;
  v_compare_school_id uuid;
  v_student_name text;
  v_lifetime int := 0;
  v_my_accuracy numeric;
  v_rank int;
  v_total int;
BEGIN
  IF v_mobile = '' OR v_pin = '' OR p_student_id IS NULL THEN
    RETURN json_build_object('error', 'bad_request');
  END IF;

  IF v_scope NOT IN ('district', 'school') THEN
    RETURN json_build_object('error', 'bad_scope');
  END IF;

  v_subject := CASE
    WHEN p_subject IS NULL OR btrim(p_subject) = '' THEN 'Math'
    WHEN lower(btrim(p_subject)) IN ('math', '數學') THEN 'Math'
    WHEN lower(btrim(p_subject)) = 'chinese' THEN 'Chinese'
    WHEN lower(btrim(p_subject)) = 'english' THEN 'English'
    ELSE btrim(p_subject)
  END;

  SELECT p.id,
         (p.paid_until IS NOT NULL AND p.paid_until >= now())
  INTO v_parent_id, v_paid
  FROM public.parents p
  WHERE p.mobile_number = v_mobile;

  IF v_parent_id IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  IF NOT v_paid THEN
    RETURN json_build_object('error', 'not_paid');
  END IF;

  SELECT
    s.grade_level,
    s.school_id,
    NULLIF(btrim(sch.district), ''),
    NULLIF(btrim(s.student_name), '')
  INTO v_grade, v_school_id, v_district, v_student_name
  FROM public.students s
  LEFT JOIN public.schools sch ON sch.id = s.school_id
  WHERE s.id = p_student_id
    AND s.parent_id = v_parent_id
    AND s.pin_code = crypt(v_pin, s.pin_code);

  IF v_grade IS NULL THEN
    RETURN json_build_object('error', 'unauthorized');
  END IF;

  SELECT COALESCE(SUM(qs.questions_attempted), 0)::int
  INTO v_lifetime
  FROM public.quiz_sessions qs
  WHERE qs.student_id = p_student_id
    AND qs.questions_attempted > 0
    AND (
      CASE
        WHEN lower(btrim(qs.subject)) IN ('math', '數學') THEN 'Math'
        WHEN lower(btrim(qs.subject)) = 'chinese' THEN 'Chinese'
        WHEN lower(btrim(qs.subject)) = 'english' THEN 'English'
        ELSE btrim(qs.subject)
      END
    ) = v_subject;

  IF v_lifetime < 100 THEN
    RETURN json_build_object(
      'error', 'not_eligible',
      'subject', v_subject,
      'lifetime_questions', v_lifetime
    );
  END IF;

  IF v_scope = 'district' AND (v_school_id IS NULL OR v_district IS NULL OR v_district = '') THEN
    RETURN json_build_object('error', 'needs_school', 'subject', v_subject);
  END IF;

  IF v_scope = 'school' AND v_school_id IS NULL THEN
    RETURN json_build_object('error', 'needs_school', 'subject', v_subject);
  END IF;

  v_compare_district := NULLIF(btrim(coalesce(p_district, '')), '');
  IF v_compare_district IS NULL THEN
    v_compare_district := v_district;
  END IF;

  v_compare_school_id := p_school_id;
  IF v_compare_school_id IS NULL THEN
    v_compare_school_id := v_school_id;
  END IF;

  IF v_scope = 'district' AND (v_compare_district IS NULL OR v_compare_district = '') THEN
    RETURN json_build_object('error', 'needs_school', 'subject', v_subject);
  END IF;

  IF v_scope = 'school' AND v_compare_school_id IS NULL THEN
    RETURN json_build_object('error', 'needs_school', 'subject', v_subject);
  END IF;

  WITH sessions_norm AS (
    SELECT
      qs.student_id,
      (qs.score::numeric / NULLIF(qs.questions_attempted, 0)) * 100 AS rate_pct,
      qs.created_at,
      CASE
        WHEN lower(btrim(qs.subject)) IN ('math', '數學') THEN 'Math'
        WHEN lower(btrim(qs.subject)) = 'chinese' THEN 'Chinese'
        WHEN lower(btrim(qs.subject)) = 'english' THEN 'English'
        ELSE btrim(qs.subject)
      END AS subject_key
    FROM public.quiz_sessions qs
    WHERE qs.student_id IS NOT NULL
      AND qs.questions_attempted > 0
      AND btrim(coalesce(qs.subject, '')) <> ''
  ),
  ranked_sessions AS (
    SELECT
      sn.student_id,
      sn.rate_pct,
      row_number() OVER (
        PARTITION BY sn.student_id
        ORDER BY sn.created_at DESC
      ) AS rn
    FROM sessions_norm sn
    WHERE sn.subject_key = v_subject
  ),
  session_agg AS (
    SELECT
      student_id,
      ROUND(AVG(rate_pct) FILTER (WHERE rn <= 10)::numeric, 1) AS accuracy
    FROM ranked_sessions
    GROUP BY student_id
    HAVING COUNT(*) FILTER (WHERE rn <= 10) > 0
  ),
  subj_lifetime AS (
    SELECT
      qs.student_id,
      SUM(qs.questions_attempted)::int AS lifetime_q
    FROM public.quiz_sessions qs
    WHERE qs.questions_attempted > 0
      AND (
        CASE
          WHEN lower(btrim(qs.subject)) IN ('math', '數學') THEN 'Math'
          WHEN lower(btrim(qs.subject)) = 'chinese' THEN 'Chinese'
          WHEN lower(btrim(qs.subject)) = 'english' THEN 'English'
          ELSE btrim(qs.subject)
        END
      ) = v_subject
    GROUP BY qs.student_id
  ),
  grade_students AS (
    SELECT
      s.id AS student_id,
      s.school_id,
      NULLIF(btrim(sch.district), '') AS district,
      pa.mobile_number
    FROM public.students s
    LEFT JOIN public.schools sch ON sch.id = s.school_id
    LEFT JOIN public.parents pa ON pa.id = s.parent_id
    WHERE s.grade_level = v_grade
      AND (
        (v_scope = 'district' AND NULLIF(btrim(sch.district), '') = v_compare_district)
        OR (v_scope = 'school' AND s.school_id IS NOT DISTINCT FROM v_compare_school_id)
      )
  ),
  eligible AS (
    SELECT
      g.student_id,
      a.accuracy
    FROM grade_students g
    JOIN session_agg a ON a.student_id = g.student_id
    JOIN subj_lifetime l ON l.student_id = g.student_id AND l.lifetime_q >= 100
    WHERE g.student_id = p_student_id
       OR g.mobile_number IS NULL
       OR g.mobile_number NOT LIKE '9999%'
  ),
  ranked AS (
    SELECT
      e.student_id,
      e.accuracy,
      rank() OVER (ORDER BY e.accuracy DESC, e.student_id ASC) AS rk,
      COUNT(*) OVER () AS tot
    FROM eligible e
  )
  SELECT
    r.accuracy,
    r.rk::int,
    r.tot::int
  INTO v_my_accuracy, v_rank, v_total
  FROM ranked r
  WHERE r.student_id = p_student_id;

  IF v_total IS NULL OR v_total < 2 THEN
    RETURN json_build_object(
      'error', 'tiny_cohort',
      'subject', v_subject,
      'grade_level', v_grade
    );
  END IF;

  IF v_rank IS NULL OR v_my_accuracy IS NULL THEN
    RETURN json_build_object(
      'error', 'not_ranked',
      'subject', v_subject
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'scope', v_scope,
    'subject', v_subject,
    'grade_level', v_grade,
    'student_id', p_student_id,
    'student_name', coalesce(v_student_name, ''),
    'rank_in_cohort', v_rank,
    'total_eligible_in_cohort', v_total,
    'last_10_avg_correct_pct', v_my_accuracy
  );
END;
$$;

REVOKE ALL ON FUNCTION public.parent_check_ranking_peer(text, text, uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_check_ranking_peer(text, text, uuid, text, text, text, uuid) TO anon, authenticated, service_role;

COMMIT;
