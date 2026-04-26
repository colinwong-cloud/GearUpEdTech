-- Admin business KPI — run in Supabase SQL Editor (full file).
-- New: students.gender, parent_dashboard_view_log, log_parent_dashboard_view,
--      admin_today_business, admin_business_monthly (service_role only for admin RPCs)

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS gender text;

CREATE TABLE IF NOT EXISTS public.parent_dashboard_view_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.parents (id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students (id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pdv_t ON public.parent_dashboard_view_log ((timezone('Asia/Hong_Kong', viewed_at::timestamptz))::date);
ALTER TABLE public.parent_dashboard_view_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.log_parent_dashboard_view(p_parent_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_parent_id IS NULL OR p_student_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.parent_dashboard_view_log (parent_id, student_id) VALUES (p_parent_id, p_student_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_parent_dashboard_view(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hkt_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (timezone('Asia/Hong_Kong', now()))::date $$;

CREATE OR REPLACE FUNCTION public.admin_today_business()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  d date := public.hkt_today();
  st int; s jsonb; q jsonb; n int;
BEGIN
  SELECT count(DISTINCT qs.student_id)::int INTO st
  FROM public.quiz_sessions qs
  WHERE qs.student_id IS NOT NULL AND qs.questions_attempted > 0
    AND (timezone('Asia/Hong_Kong', qs.created_at::timestamptz))::date = d;

  SELECT coalesce(jsonb_object_agg(su.subject, su.cnt), '{}') INTO s FROM (
    SELECT qs.subject, count(*)::int AS cnt
    FROM public.quiz_sessions qs
    WHERE qs.student_id IS NOT NULL AND qs.questions_attempted > 0
      AND (timezone('Asia/Hong_Kong', qs.created_at::timestamptz))::date = d
    GROUP BY qs.subject) su;

  SELECT coalesce(jsonb_object_agg(qu.subject, qu.tq), '{}') INTO q FROM (
    SELECT qs.subject, coalesce(sum(qs.questions_attempted),0)::int AS tq
    FROM public.quiz_sessions qs
    WHERE qs.student_id IS NOT NULL AND qs.questions_attempted > 0
      AND (timezone('Asia/Hong_Kong', qs.created_at::timestamptz))::date = d
    GROUP BY qs.subject) qu;

  SELECT count(*)::int INTO n FROM public.students s
  WHERE (timezone('Asia/Hong_Kong', s.created_at::timestamptz))::date = d;

  RETURN jsonb_build_object(
    'hkt_date', d,
    'students_practice_distinct', st,
    'sessions_by_subject', s, 'questions_by_subject', q,
    'new_students_today', n
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_today_business() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_today_business() TO service_role;

-- Monthly static (HKT) through "yesterday"
CREATE OR REPLACE FUNCTION public.admin_business_monthly()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  yst date := public.hkt_today() - 1;
  ms date := date_trunc('month', yst::timestamp)::date;
  m0 date; m1 date; i int;
  reg_mtd int; pstu_mtd int; pvi_mtd int;
  t jsonb; arr jsonb := '[]'::jsonb;
  yy int; mm int;
  reg_tot int; par_tot int; sess_tot int; ans_tot int;
  sch jsonb; sch_tr jsonb := '[]'::jsonb; mo jsonb;
  s_id uuid; pct numeric;
  sk text;
  rates_obj jsonb;
  k int;
  d1 date; d2 date;
BEGIN
  SELECT count(*)::int INTO reg_tot FROM public.students;
  SELECT count(*)::int INTO par_tot FROM public.parents;
  SELECT count(*)::int INTO sess_tot FROM public.quiz_sessions q WHERE q.student_id IS NOT NULL AND q.questions_attempted>0;
  SELECT count(*)::int INTO ans_tot FROM public.session_answers;

  SELECT coalesce(count(*),0) INTO reg_mtd FROM public.students s
  WHERE (timezone('Asia/Hong_Kong', s.created_at::timestamptz))::date >= ms
    AND (timezone('Asia/Hong_Kong', s.created_at::timestamptz))::date <= yst;

  SELECT coalesce(count(DISTINCT q.student_id),0) INTO pstu_mtd FROM public.quiz_sessions q
  WHERE q.student_id IS NOT NULL AND q.questions_attempted>0
    AND (timezone('Asia/Hong_Kong', q.created_at::timestamptz))::date >= ms
    AND (timezone('Asia/Hong_Kong', q.created_at::timestamptz))::date <= yst;

  SELECT coalesce(count(*),0) INTO pvi_mtd FROM public.parent_dashboard_view_log p
  WHERE (timezone('Asia/Hong_Kong', p.viewed_at::timestamptz))::date >= ms
    AND (timezone('Asia/Hong_Kong', p.viewed_at::timestamptz))::date <= yst;

  FOR i IN 0..11 LOOP
    m0 := (date_trunc('month', (yst::timestamp - (i || ' months')::interval)))::date;
    m1 := (m0 + interval '1 month' - interval '1 day')::date;
    IF m1 > yst THEN m1 := yst; END IF;
    yy := EXTRACT(YEAR FROM m0)::int;
    mm := EXTRACT(MONTH FROM m0)::int;
    t := jsonb_build_object('y', yy, 'm', mm,
      'key', to_char(m0, 'YYYY-MM'),
      'registrations', (SELECT coalesce(count(*),0) FROM public.students s2 WHERE (timezone('Asia/Hong_Kong', s2.created_at::timestamptz))::date >= m0 AND (timezone('Asia/Hong_Kong', s2.created_at::timestamptz))::date <= m1),
      'practice_students', (SELECT coalesce(count(DISTINCT q2.student_id),0) FROM public.quiz_sessions q2 WHERE q2.student_id IS NOT NULL AND q2.questions_attempted>0 AND (timezone('Asia/Hong_Kong', q2.created_at::timestamptz))::date >= m0 AND (timezone('Asia/Hong_Kong', q2.created_at::timestamptz))::date <= m1),
      'parent_views', (SELECT coalesce(count(*),0) FROM public.parent_dashboard_view_log p2 WHERE (timezone('Asia/Hong_Kong', p2.viewed_at::timestamptz))::date >= m0 AND (timezone('Asia/Hong_Kong', p2.viewed_at::timestamptz))::date <= m1),
      'male', (SELECT coalesce(count(*),0) FROM public.students s3 WHERE (timezone('Asia/Hong_Kong', s3.created_at::timestamptz))::date >= m0 AND (timezone('Asia/Hong_Kong', s3.created_at::timestamptz))::date <= m1 AND upper(trim(coalesce(s3.gender,'')))='M'),
      'female', (SELECT coalesce(count(*),0) FROM public.students s3 WHERE (timezone('Asia/Hong_Kong', s3.created_at::timestamptz))::date >= m0 AND (timezone('Asia/Hong_Kong', s3.created_at::timestamptz))::date <= m1 AND upper(trim(coalesce(s3.gender,'')))='F'),
      'undisclosed', (SELECT coalesce(count(*),0) FROM public.students s3 WHERE (timezone('Asia/Hong_Kong', s3.created_at::timestamptz))::date >= m0 AND (timezone('Asia/Hong_Kong', s3.created_at::timestamptz))::date <= m1 AND (s3.gender IS NULL OR btrim(s3.gender)='' OR upper(trim(s3.gender)) NOT IN ('M','F')))
    );
    arr := arr || jsonb_build_array(t);
  END LOOP;

  SELECT coalesce(jsonb_agg(row_to_json(sx)), '[]') INTO sch FROM (
    SELECT
      sc.id::text AS id,
      coalesce(sc.name_zh, sc.name_en) AS name,
      sc.district, sc.area,
      (SELECT coalesce(jsonb_object_agg(gg.grade, gg.cnt), '{}') FROM (SELECT s4.grade_level AS grade, count(*)::int AS cnt FROM public.students s4 WHERE s4.school_id = sc.id GROUP BY s4.grade_level) AS gg(grade, cnt)) AS by_grade
    FROM public.schools sc
    WHERE EXISTS (SELECT 1 FROM public.students s5 WHERE s5.school_id = sc.id)
    ORDER BY sc.district, coalesce(sc.name_zh, sc.name_en) LIMIT 5000
  ) sx;

  FOR k IN 0..11 LOOP
    d1 := (date_trunc('month', (yst::timestamp - (k || ' months')::interval)))::date;
    d2 := (d1 + interval '1 month' - interval '1 day')::date;
    IF d2 > yst THEN d2 := yst; END IF;
    sk := to_char(d1, 'YYYY-MM');
    rates_obj := '{}'::jsonb;
    FOR s_id IN SELECT s6.id FROM public.schools s6 WHERE EXISTS (SELECT 1 FROM public.students st WHERE st.school_id = s6.id) LOOP
      SELECT CASE WHEN coalesce(tot,0) = 0 THEN 0::numeric ELSE round((100.0 * ri / tot)::numeric, 2) END INTO pct
      FROM (
        SELECT
          coalesce(count(*),0)::numeric AS tot,
          coalesce(sum(CASE WHEN sa.is_correct THEN 1 ELSE 0 END),0)::numeric AS ri
        FROM public.session_answers sa
        JOIN public.quiz_sessions qx ON qx.id = sa.session_id
        JOIN public.students st ON st.id = qx.student_id
        WHERE st.school_id = s_id AND qx.questions_attempted > 0
          AND (timezone('Asia/Hong_Kong', qx.created_at::timestamptz))::date >= d1
          AND (timezone('Asia/Hong_Kong', qx.created_at::timestamptz))::date <= d2
      ) z(tot, ri);
      rates_obj := rates_obj || jsonb_build_object(s_id::text, coalesce(pct,0));
    END LOOP;
    sch_tr := sch_tr || jsonb_build_array(jsonb_build_object('key', sk, 'by_school_id', coalesce(rates_obj, '{}')));
  END LOOP;

  RETURN jsonb_build_object(
    'through_hkt', yst,
    'mt_year', EXTRACT(YEAR FROM yst)::int, 'mt_month', EXTRACT(MONTH FROM yst)::int,
    'mt_new_students', reg_mtd,
    'mt_practice_students', pstu_mtd,
    'mt_parent_views', pvi_mtd,
    'alltime_students', reg_tot, 'alltime_parents', par_tot,
    'alltime_practice_sessions', sess_tot, 'alltime_session_answers', ans_tot,
    'trend_12m', arr,
    'schools_students_by_grade', coalesce(sch, '[]'::jsonb),
    'school_monthly_correct_pct', sch_tr
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_business_monthly() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_business_monthly() TO service_role;
