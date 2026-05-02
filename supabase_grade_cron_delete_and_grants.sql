-- Run in Supabase after the other grade_*.sql files (or merge into your one migration).
-- 1) delete_grade_averages_for_grade — safe to call before a fallback recompute to avoid unique violations.
-- 2) GRANT EXECUTE on all public cron RPCs the Next.js route may call (anon = PostgREST default).

CREATE OR REPLACE FUNCTION public.delete_grade_averages_for_grade(p_grade_level text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL statement_timeout = '1min';
  DELETE FROM public.grade_averages WHERE grade_level = p_grade_level;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_grade_averages() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_distinct_grade_levels() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_question_types_for_grade(text) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_grade_averages_for_grade(text) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_grade_averages() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_grade_averages_for_grade(text) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_grade_overall_for_grade(text) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_grade_by_type_for_grade(text) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_grade_one_type_for_grade(text, text) TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_student_grade_rankings() TO postgres, anon, authenticated, service_role;
-- If a GRANT fails, apply the function-defining SQL for that function first, then re-run the GRANT lines.
