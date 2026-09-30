-- Tutor student comparison.
-- Purpose:
-- 1) paid_until on tutor codes, so the classmate comparison can stay on the paid plan
-- 2) last-10-session accuracy for one student versus same school, same district, and same grade
--
-- Peer pools skip parent mobiles that start with 9999. The selected student is always included.
-- Safe to run multiple times.
-- After this file: comparison stays locked until paid_until is in the future.

BEGIN;

ALTER TABLE public.tutor_referral_codes
  ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.tutor_student_peer_comparison(
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
  v_subject text;
  v_grade text;
  v_school_id uuid;
  v_school_name text;
  v_district text;
  v_members json;
BEGIN
  IF p_student_id IS NULL THEN
    RETURN json_build_object('error', 'missing_student');
  END IF;

  v_subject := CASE
    WHEN p_subject IS NULL OR btrim(p_subject) = '' THEN 'Math'
    WHEN lower(btrim(p_subject)) IN ('math', '數學') THEN 'Math'
    WHEN lower(btrim(p_subject)) = 'chinese' THEN 'Chinese'
    WHEN lower(btrim(p_subject)) = 'english' THEN 'English'
    ELSE btrim(p_subject)
  END;

  SELECT
    s.grade_level,
    s.school_id,
    COALESCE(NULLIF(btrim(sch.name_zh), ''), NULLIF(btrim(sch.name_en), '')),
    NULLIF(btrim(sch.district), '')
  INTO v_grade, v_school_id, v_school_name, v_district
  FROM public.students s
  LEFT JOIN public.schools sch ON sch.id = s.school_id
  WHERE s.id = p_student_id;

  IF v_grade IS NULL THEN
    RETURN json_build_object('error', 'student_not_found');
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
  grade_students AS (
    SELECT
      s.id AS student_id,
      s.school_id,
      NULLIF(btrim(sch.district), '') AS district,
      p.mobile_number
    FROM public.students s
    LEFT JOIN public.schools sch ON sch.id = s.school_id
    LEFT JOIN public.parents p ON p.id = s.parent_id
    WHERE s.grade_level = v_grade
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'student_id', g.student_id,
        'school_id', g.school_id,
        'district', g.district,
        'accuracy', a.accuracy
      )
    ),
    '[]'::json
  )
  INTO v_members
  FROM grade_students g
  JOIN session_agg a ON a.student_id = g.student_id
  WHERE g.student_id = p_student_id
     OR g.mobile_number IS NULL
     OR g.mobile_number NOT LIKE '9999%';

  RETURN json_build_object(
    'subject', v_subject,
    'grade_level', v_grade,
    'school_id', v_school_id,
    'school_name', v_school_name,
    'district', v_district,
    'members', v_members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_student_peer_comparison(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_student_peer_comparison(uuid, text) TO service_role;

COMMIT;
