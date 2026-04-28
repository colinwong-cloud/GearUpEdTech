-- Session practice summaries (Traditional Chinese) — student vs parent email wording
-- Run once in Supabase SQL Editor

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS session_practice_summary text;

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS session_practice_summary_parent text;

CREATE OR REPLACE FUNCTION public.save_session_practice_summaries(
  p_session_id uuid,
  p_student_id uuid,
  p_student_summary text,
  p_parent_summary text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.quiz_sessions
  SET
    session_practice_summary = nullif(btrim(p_student_summary), ''),
    session_practice_summary_parent = nullif(btrim(coalesce(p_parent_summary, '')), '')
  WHERE id = p_session_id AND student_id = p_student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_session_practice_summaries(uuid, uuid, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_quiz_email_data(
  p_student_id uuid,
  p_session_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'parent_name', p.parent_name,
    'parent_email', p.email,
    'student_name', s.student_name,
    'session', json_build_object(
      'id', qs.id,
      'subject', qs.subject,
      'questions_attempted', qs.questions_attempted,
      'score', qs.score,
      'time_spent_seconds', qs.time_spent_seconds,
      'created_at', qs.created_at
    ),
    'session_practice_summary', coalesce(nullif(btrim(qs.session_practice_summary), ''), ''),
    'session_practice_summary_parent', coalesce(nullif(btrim(qs.session_practice_summary_parent), ''), ''),
    'weekly_count', (
      SELECT count(*)::int FROM public.quiz_sessions
      WHERE student_id = p_student_id
        AND created_at >= date_trunc('week', now())
    ),
    'type_breakdown', coalesce((
      SELECT json_agg(row_to_json(tb) ORDER BY tb.question_type)
      FROM (
        SELECT
          q.question_type,
          count(*)::int AS total,
          sum(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
        FROM public.session_answers sa
        JOIN public.questions q ON q.id = sa.question_id
        WHERE sa.session_id = p_session_id
        GROUP BY q.question_type
      ) tb
    ), '[]'::json)
  ) INTO v_result
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  JOIN public.quiz_sessions qs ON qs.id = p_session_id AND qs.student_id = p_student_id
  WHERE s.id = p_student_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_email_data(uuid, uuid) TO anon, authenticated, service_role;
