-- Admin business KPI — run in Supabase SQL Editor (full file).
-- New: students.gender, parent_dashboard_view_log, log_parent_dashboard_view,
--      admin_today_business, admin_business_monthly (service_role only for admin RPCs)
--
-- Index: use a STORED generated column hkt_date + plain "CREATE INDEX (hkt_date)".
-- Some clients reject expression indexes with casts (::) in SQL Editor; this avoids that.

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS gender text;

-- HKT date for index-friendly filters (stored; maintained on insert/update)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS hkt_reg_date date
  GENERATED ALWAYS AS (date(timezone('Asia/Hong_Kong', created_at::timestamptz))) STORED;

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS hkt_practice_date date
  GENERATED ALWAYS AS (date(timezone('Asia/Hong_Kong', created_at::timestamptz))) STORED;

CREATE TABLE IF NOT EXISTS public.parent_dashboard_view_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.parents (id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students (id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

-- Existing installs from an older script: add the column (idempotent)
ALTER TABLE public.parent_dashboard_view_log
  ADD COLUMN IF NOT EXISTS hkt_date date
  GENERATED ALWAYS AS (date(timezone('Asia/Hong_Kong', viewed_at))) STORED;

DROP INDEX IF EXISTS idx_pdv_t;
CREATE INDEX IF NOT EXISTS idx_pdv_t ON public.parent_dashboard_view_log (hkt_date);

CREATE INDEX IF NOT EXISTS idx_students_hkt_reg_date
  ON public.students (hkt_reg_date);

CREATE INDEX IF NOT EXISTS idx_students_school
  ON public.students (school_id);

CREATE INDEX IF NOT EXISTS idx_qs_hkt_practice
  ON public.quiz_sessions (hkt_practice_date)
  WHERE student_id IS NOT NULL AND questions_attempted > 0;

CREATE INDEX IF NOT EXISTS idx_qs_student_hkt
  ON public.quiz_sessions (student_id, hkt_practice_date)
  WHERE student_id IS NOT NULL AND questions_attempted > 0;

CREATE INDEX IF NOT EXISTS idx_session_answers_session_id
  ON public.session_answers (session_id);

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
VOLATILE
AS $$
DECLARE
  d date := public.hkt_today();
  st int; s jsonb; q jsonb; n int;
BEGIN
  SELECT count(DISTINCT qs.student_id)::int INTO st
  FROM public.quiz_sessions qs
  WHERE qs.student_id IS NOT NULL AND qs.questions_attempted > 0
    AND qs.hkt_practice_date = d;

  SELECT coalesce(jsonb_object_agg(su.subject, su.cnt), '{}') INTO s FROM (
    SELECT qs.subject, count(*)::int AS cnt
    FROM public.quiz_sessions qs
    WHERE qs.student_id IS NOT NULL AND qs.questions_attempted > 0
      AND qs.hkt_practice_date = d
    GROUP BY qs.subject) su;

  SELECT coalesce(jsonb_object_agg(qu.subject, qu.tq), '{}') INTO q FROM (
    SELECT qs.subject, coalesce(sum(qs.questions_attempted),0)::int AS tq
    FROM public.quiz_sessions qs
    WHERE qs.student_id IS NOT NULL AND qs.questions_attempted > 0
      AND qs.hkt_practice_date = d
    GROUP BY qs.subject) qu;

  SELECT count(*)::int INTO n FROM public.students s
  WHERE s.hkt_reg_date = d;

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
VOLATILE
AS $$
DECLARE
  yst date := public.hkt_today() - 1;
  ms date := (date_trunc('month', (yst::timestamp))::date);
  m0 date; m1 date; i int;
  reg_mtd int; pstu_mtd int; pvi_mtd int;
  sess_mtd int; ans_mtd int;
  t jsonb; arr jsonb := '[]'::jsonb;
  yy int; mm int;
  reg_tot int; par_tot int; sess_tot int; ans_tot int;
  sch jsonb; sch_tr jsonb := '[]'::jsonb;
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
  WHERE s.hkt_reg_date IS NOT NULL AND s.hkt_reg_date >= ms AND s.hkt_reg_date <= yst;

  SELECT coalesce(count(DISTINCT q.student_id),0) INTO pstu_mtd FROM public.quiz_sessions q
  WHERE q.student_id IS NOT NULL AND q.questions_attempted>0
    AND q.hkt_practice_date IS NOT NULL AND q.hkt_practice_date >= ms AND q.hkt_practice_date <= yst;

  SELECT coalesce(count(*),0) INTO pvi_mtd FROM public.parent_dashboard_view_log p
  WHERE p.hkt_date IS NOT NULL
    AND p.hkt_date >= ms
    AND p.hkt_date <= yst;

  SELECT coalesce(count(*), 0) INTO sess_mtd
  FROM public.quiz_sessions q
  WHERE q.student_id IS NOT NULL
    AND q.questions_attempted > 0
    AND q.hkt_practice_date IS NOT NULL
    AND q.hkt_practice_date >= ms
    AND q.hkt_practice_date <= yst;

  SELECT coalesce(count(sa.id), 0) INTO ans_mtd
  FROM public.session_answers sa
  JOIN public.quiz_sessions q ON q.id = sa.session_id
  WHERE q.student_id IS NOT NULL
    AND q.questions_attempted > 0
    AND q.hkt_practice_date IS NOT NULL
    AND q.hkt_practice_date >= ms
    AND q.hkt_practice_date <= yst;

  FOR i IN 0..11 LOOP
    m0 := (date_trunc('month', (yst::timestamp - (i || ' months')::interval)))::date;
    m1 := (m0 + interval '1 month' - interval '1 day')::date;
    IF m1 > yst THEN m1 := yst; END IF;
    yy := EXTRACT(YEAR FROM m0)::int;
    mm := EXTRACT(MONTH FROM m0)::int;
    t := jsonb_build_object('y', yy, 'm', mm,
      'key', to_char(m0, 'YYYY-MM'),
      'registrations', (SELECT coalesce(count(*),0) FROM public.students s2
        WHERE s2.hkt_reg_date IS NOT NULL AND s2.hkt_reg_date >= m0 AND s2.hkt_reg_date <= m1),
      'practice_students', (SELECT coalesce(count(DISTINCT q2.student_id),0) FROM public.quiz_sessions q2
        WHERE q2.student_id IS NOT NULL AND q2.questions_attempted>0
          AND q2.hkt_practice_date IS NOT NULL AND q2.hkt_practice_date >= m0 AND q2.hkt_practice_date <= m1),
      'parent_views', (SELECT coalesce(count(*),0) FROM public.parent_dashboard_view_log p2 WHERE p2.hkt_date IS NOT NULL AND p2.hkt_date >= m0 AND p2.hkt_date <= m1),
      'male', (SELECT coalesce(count(*),0) FROM public.students s3
        WHERE s3.hkt_reg_date IS NOT NULL AND s3.hkt_reg_date >= m0 AND s3.hkt_reg_date <= m1
        AND upper(trim(coalesce(s3.gender,'')))='M'),
      'female', (SELECT coalesce(count(*),0) FROM public.students s3
        WHERE s3.hkt_reg_date IS NOT NULL AND s3.hkt_reg_date >= m0 AND s3.hkt_reg_date <= m1
        AND upper(trim(coalesce(s3.gender,'')))='F'),
      'undisclosed', (SELECT coalesce(count(*),0) FROM public.students s3
        WHERE s3.hkt_reg_date IS NOT NULL AND s3.hkt_reg_date >= m0 AND s3.hkt_reg_date <= m1
        AND (s3.gender IS NULL OR btrim(s3.gender)='' OR upper(trim(s3.gender)) NOT IN ('M','F')))
    );
    arr := arr || jsonb_build_array(t);
  END LOOP;

  SELECT coalesce(jsonb_agg(row_to_json(sx)), '[]') INTO sch FROM (
    SELECT
      sc.id::text AS id,
      coalesce(sc.name_zh, sc.name_en) AS name,
      sc.district, sc.area,
      (SELECT coalesce(jsonb_object_agg(gg.grade, gg.cnt), '{}')
        FROM (SELECT s4.grade_level AS grade, count(*)::int AS cnt
              FROM public.students s4 WHERE s4.school_id = sc.id
              GROUP BY s4.grade_level) AS gg(grade, cnt)
      ) AS by_grade
    FROM public.schools sc
    WHERE EXISTS (SELECT 1 FROM public.students s5 WHERE s5.school_id = sc.id)
    ORDER BY sc.district, coalesce(sc.name_zh, sc.name_en) LIMIT 5000
  ) sx;

  -- One pass per month: use quiz_sessions only (no session_answers) so large answer tables are not
  -- scanned 12 times. Metric: weighted overall correct % = 100 * sum(score) / sum(questions_attempted)
  -- for sessions in the month (score is correct count per your schema; matches per-answer rate when no partial credit).
  FOR k IN 0..11 LOOP
    d1 := (date_trunc('month', (yst::timestamp - (k || ' months')::interval)))::date;
    d2 := (d1 + interval '1 month' - interval '1 day')::date;
    IF d2 > yst THEN d2 := yst; END IF;
    sk := to_char(d1, 'YYYY-MM');

    SELECT coalesce(
      (SELECT jsonb_object_agg(
          si.sid::text,
          CASE
            WHEN coalesce(a.tq, 0) = 0 THEN 0
            ELSE round(
              (100.0 * (a.correct_sum::numeric) / a.tq::numeric)::numeric,
              2
            )
          END
      )
      FROM (SELECT DISTINCT school_id AS sid FROM public.students WHERE school_id IS NOT NULL) AS si
      LEFT JOIN (
        SELECT
          st.school_id AS gsid,
          coalesce(sum(qx.questions_attempted), 0)::bigint AS tq,
          coalesce(sum(qx.score), 0)::bigint AS correct_sum
        FROM public.quiz_sessions qx
        INNER JOIN public.students st ON st.id = qx.student_id
        WHERE qx.student_id IS NOT NULL
          AND qx.questions_attempted > 0
          AND qx.hkt_practice_date IS NOT NULL
          AND qx.hkt_practice_date >= d1
          AND qx.hkt_practice_date <= d2
          AND st.school_id IS NOT NULL
        GROUP BY st.school_id
      ) a ON a.gsid = si.sid
      ),
      '{}'::jsonb
    ) INTO rates_obj;

    sch_tr := sch_tr || jsonb_build_array(jsonb_build_object('key', sk, 'by_school_id', coalesce(rates_obj, '{}'::jsonb)));
  END LOOP;

  RETURN jsonb_build_object(
    'through_hkt', yst,
    'mt_year', EXTRACT(YEAR FROM yst)::int, 'mt_month', EXTRACT(MONTH FROM yst)::int,
    'mt_new_students', reg_mtd,
    'mt_practice_students', pstu_mtd,
    'mt_parent_views', pvi_mtd,
    'mt_practice_sessions', sess_mtd,
    'mt_session_answers', ans_mtd,
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
