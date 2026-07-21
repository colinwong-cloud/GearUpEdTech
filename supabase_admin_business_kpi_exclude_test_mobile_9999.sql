-- Business KPI hotfix: exclude test data where parent mobile starts with 9999
-- Scope:
-- 1) admin_today_business
-- 2) admin_business_monthly_summary
-- 3) admin_business_school_details

BEGIN;

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
  JOIN public.students st2 ON st2.id = qs.student_id
  JOIN public.parents p ON p.id = st2.parent_id
  WHERE qs.student_id IS NOT NULL AND qs.questions_attempted > 0
    AND qs.hkt_practice_date = d
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

  SELECT coalesce(jsonb_object_agg(su.subject, su.cnt), '{}') INTO s FROM (
    SELECT qs.subject, count(*)::int AS cnt
    FROM public.quiz_sessions qs
    JOIN public.students st2 ON st2.id = qs.student_id
    JOIN public.parents p ON p.id = st2.parent_id
    WHERE qs.student_id IS NOT NULL AND qs.questions_attempted > 0
      AND qs.hkt_practice_date = d
      AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%')
    GROUP BY qs.subject) su;

  SELECT coalesce(jsonb_object_agg(qu.subject, qu.tq), '{}') INTO q FROM (
    SELECT qs.subject, coalesce(sum(qs.questions_attempted),0)::int AS tq
    FROM public.quiz_sessions qs
    JOIN public.students st2 ON st2.id = qs.student_id
    JOIN public.parents p ON p.id = st2.parent_id
    WHERE qs.student_id IS NOT NULL AND qs.questions_attempted > 0
      AND qs.hkt_practice_date = d
      AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%')
    GROUP BY qs.subject) qu;

  SELECT count(*)::int INTO n
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE s.hkt_reg_date = d
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

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

CREATE OR REPLACE FUNCTION public.admin_business_monthly_summary()
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
  districts jsonb := '[]'::jsonb;
BEGIN
  SELECT count(*)::int INTO reg_tot
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%';

  SELECT count(*)::int INTO par_tot
  FROM public.parents p
  WHERE p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%';

  SELECT count(*)::int INTO sess_tot
  FROM public.quiz_sessions q
  JOIN public.students s ON s.id = q.student_id
  JOIN public.parents p ON p.id = s.parent_id
  WHERE q.student_id IS NOT NULL
    AND q.questions_attempted > 0
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

  SELECT count(*)::int INTO ans_tot
  FROM public.session_answers sa
  JOIN public.quiz_sessions q ON q.id = sa.session_id
  JOIN public.students s ON s.id = q.student_id
  JOIN public.parents p ON p.id = s.parent_id
  WHERE p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%';

  SELECT coalesce(count(*),0) INTO reg_mtd
  FROM public.students s
  JOIN public.parents p ON p.id = s.parent_id
  WHERE s.hkt_reg_date IS NOT NULL
    AND s.hkt_reg_date >= ms
    AND s.hkt_reg_date <= yst
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

  SELECT coalesce(count(DISTINCT q.student_id),0) INTO pstu_mtd
  FROM public.quiz_sessions q
  JOIN public.students s ON s.id = q.student_id
  JOIN public.parents p ON p.id = s.parent_id
  WHERE q.student_id IS NOT NULL
    AND q.questions_attempted > 0
    AND q.hkt_practice_date IS NOT NULL
    AND q.hkt_practice_date >= ms
    AND q.hkt_practice_date <= yst
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

  SELECT coalesce(count(*),0) INTO pvi_mtd
  FROM public.parent_dashboard_view_log p
  LEFT JOIN public.parents pa ON pa.id = p.parent_id
  WHERE p.hkt_date IS NOT NULL
    AND p.hkt_date >= ms
    AND p.hkt_date <= yst
    AND (pa.mobile_number IS NULL OR pa.mobile_number NOT LIKE '9999%');

  SELECT coalesce(count(*), 0) INTO sess_mtd
  FROM public.quiz_sessions q
  JOIN public.students s ON s.id = q.student_id
  JOIN public.parents p ON p.id = s.parent_id
  WHERE q.student_id IS NOT NULL
    AND q.questions_attempted > 0
    AND q.hkt_practice_date IS NOT NULL
    AND q.hkt_practice_date >= ms
    AND q.hkt_practice_date <= yst
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

  SELECT coalesce(count(sa.id), 0) INTO ans_mtd
  FROM public.session_answers sa
  JOIN public.quiz_sessions q ON q.id = sa.session_id
  JOIN public.students s ON s.id = q.student_id
  JOIN public.parents p ON p.id = s.parent_id
  WHERE q.student_id IS NOT NULL
    AND q.questions_attempted > 0
    AND q.hkt_practice_date IS NOT NULL
    AND q.hkt_practice_date >= ms
    AND q.hkt_practice_date <= yst
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

  FOR i IN 0..11 LOOP
    m0 := (date_trunc('month', (yst::timestamp - (i || ' months')::interval)))::date;
    m1 := (m0 + interval '1 month' - interval '1 day')::date;
    IF m1 > yst THEN m1 := yst; END IF;
    yy := EXTRACT(YEAR FROM m0)::int;
    mm := EXTRACT(MONTH FROM m0)::int;
    t := jsonb_build_object(
      'y', yy,
      'm', mm,
      'key', to_char(m0, 'YYYY-MM'),
      'registrations', (
        SELECT coalesce(count(*),0)
        FROM public.students s2
        JOIN public.parents p2 ON p2.id = s2.parent_id
        WHERE s2.hkt_reg_date IS NOT NULL
          AND s2.hkt_reg_date >= m0
          AND s2.hkt_reg_date <= m1
          AND (p2.mobile_number IS NULL OR p2.mobile_number NOT LIKE '9999%')
      ),
      'practice_students', (
        SELECT coalesce(count(DISTINCT q2.student_id),0)
        FROM public.quiz_sessions q2
        JOIN public.students st2 ON st2.id = q2.student_id
        JOIN public.parents p2 ON p2.id = st2.parent_id
        WHERE q2.student_id IS NOT NULL
          AND q2.questions_attempted > 0
          AND q2.hkt_practice_date IS NOT NULL
          AND q2.hkt_practice_date >= m0
          AND q2.hkt_practice_date <= m1
          AND (p2.mobile_number IS NULL OR p2.mobile_number NOT LIKE '9999%')
      ),
      'parent_views', (
        SELECT coalesce(count(*),0)
        FROM public.parent_dashboard_view_log p2
        LEFT JOIN public.parents pp2 ON pp2.id = p2.parent_id
        WHERE p2.hkt_date IS NOT NULL
          AND p2.hkt_date >= m0
          AND p2.hkt_date <= m1
          AND (pp2.mobile_number IS NULL OR pp2.mobile_number NOT LIKE '9999%')
      ),
      'male', (
        SELECT coalesce(count(*),0)
        FROM public.students s3
        JOIN public.parents p3 ON p3.id = s3.parent_id
        WHERE s3.hkt_reg_date IS NOT NULL
          AND s3.hkt_reg_date >= m0
          AND s3.hkt_reg_date <= m1
          AND upper(trim(coalesce(s3.gender,'')))='M'
          AND (p3.mobile_number IS NULL OR p3.mobile_number NOT LIKE '9999%')
      ),
      'female', (
        SELECT coalesce(count(*),0)
        FROM public.students s3
        JOIN public.parents p3 ON p3.id = s3.parent_id
        WHERE s3.hkt_reg_date IS NOT NULL
          AND s3.hkt_reg_date >= m0
          AND s3.hkt_reg_date <= m1
          AND upper(trim(coalesce(s3.gender,'')))='F'
          AND (p3.mobile_number IS NULL OR p3.mobile_number NOT LIKE '9999%')
      ),
      'undisclosed', (
        SELECT coalesce(count(*),0)
        FROM public.students s3
        JOIN public.parents p3 ON p3.id = s3.parent_id
        WHERE s3.hkt_reg_date IS NOT NULL
          AND s3.hkt_reg_date >= m0
          AND s3.hkt_reg_date <= m1
          AND (s3.gender IS NULL OR btrim(s3.gender)='' OR upper(trim(s3.gender)) NOT IN ('M','F'))
          AND (p3.mobile_number IS NULL OR p3.mobile_number NOT LIKE '9999%')
      )
    );
    arr := arr || jsonb_build_array(t);
  END LOOP;

  SELECT coalesce(jsonb_agg(d ORDER BY d), '[]'::jsonb) INTO districts
  FROM (
    SELECT DISTINCT sc.district AS d
    FROM public.schools sc
    WHERE sc.district IS NOT NULL
      AND btrim(sc.district) <> ''
      AND EXISTS (
        SELECT 1
        FROM public.students s
        JOIN public.parents p ON p.id = s.parent_id
        WHERE s.school_id = sc.id
          AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%')
      )
  ) x;

  RETURN jsonb_build_object(
    'through_hkt', yst,
    'mt_year', EXTRACT(YEAR FROM yst)::int,
    'mt_month', EXTRACT(MONTH FROM yst)::int,
    'mt_new_students', reg_mtd,
    'mt_practice_students', pstu_mtd,
    'mt_parent_views', pvi_mtd,
    'mt_practice_sessions', sess_mtd,
    'mt_session_answers', ans_mtd,
    'alltime_students', reg_tot,
    'alltime_parents', par_tot,
    'alltime_practice_sessions', sess_tot,
    'alltime_session_answers', ans_tot,
    'trend_12m', arr,
    'available_districts', districts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_business_monthly_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_business_monthly_summary() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_business_school_details(
  p_district text,
  p_school_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE
AS $$
DECLARE
  yst date := public.hkt_today() - 1;
  d1 date; d2 date; k int;
  sk text;
  v_district text := nullif(btrim(coalesce(p_district, '')), '');
  schools_data jsonb := '[]'::jsonb;
  rates_data jsonb := '[]'::jsonb;
  rates_by_subject_data jsonb := '[]'::jsonb;
  grade_trend_data jsonb := '[]'::jsonb;
  rates_obj jsonb := '{}'::jsonb;
  grade_obj jsonb := '{}'::jsonb;
  ch_pct numeric := 0;
  en_pct numeric := 0;
  ma_pct numeric := 0;
BEGIN
  IF v_district IS NULL THEN
    RAISE EXCEPTION '請先選擇地區';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(sx)), '[]'::jsonb) INTO schools_data
  FROM (
    SELECT
      sc.id::text AS id,
      coalesce(sc.name_zh, sc.name_en) AS name,
      sc.district,
      sc.area,
      (
        SELECT coalesce(jsonb_object_agg(gg.grade, gg.cnt), '{}'::jsonb)
        FROM (
          SELECT s4.grade_level AS grade, count(*)::int AS cnt
          FROM public.students s4
          JOIN public.parents p4 ON p4.id = s4.parent_id
          WHERE s4.school_id = sc.id
            AND (p4.mobile_number IS NULL OR p4.mobile_number NOT LIKE '9999%')
          GROUP BY s4.grade_level
        ) gg
      ) AS by_grade
    FROM public.schools sc
    WHERE sc.district = v_district
      AND EXISTS (
        SELECT 1
        FROM public.students s5
        JOIN public.parents p5 ON p5.id = s5.parent_id
        WHERE s5.school_id = sc.id
          AND (p5.mobile_number IS NULL OR p5.mobile_number NOT LIKE '9999%')
      )
      AND (p_school_id IS NULL OR sc.id = p_school_id)
    ORDER BY coalesce(sc.name_zh, sc.name_en)
    LIMIT 1200
  ) sx;

  FOR k IN 0..11 LOOP
    d1 := (date_trunc('month', (yst::timestamp - (k || ' months')::interval)))::date;
    d2 := (d1 + interval '1 month' - interval '1 day')::date;
    IF d2 > yst THEN d2 := yst; END IF;
    sk := to_char(d1, 'YYYY-MM');

    SELECT coalesce(
      (
        SELECT jsonb_object_agg(
          si.sid::text,
          CASE
            WHEN coalesce(a.tq, 0) = 0 THEN 0
            ELSE round((100.0 * a.correct_sum::numeric / a.tq::numeric)::numeric, 2)
          END
        )
        FROM (
          SELECT DISTINCT s.school_id AS sid
          FROM public.students s
          JOIN public.schools sc ON sc.id = s.school_id
          JOIN public.parents p ON p.id = s.parent_id
          WHERE s.school_id IS NOT NULL
            AND sc.district = v_district
            AND (p_school_id IS NULL OR s.school_id = p_school_id)
            AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%')
        ) si
        LEFT JOIN (
          SELECT
            st.school_id AS gsid,
            coalesce(sum(qx.questions_attempted), 0)::bigint AS tq,
            coalesce(sum(qx.score), 0)::bigint AS correct_sum
          FROM public.quiz_sessions qx
          JOIN public.students st ON st.id = qx.student_id
          JOIN public.schools sc ON sc.id = st.school_id
          JOIN public.parents p ON p.id = st.parent_id
          WHERE qx.student_id IS NOT NULL
            AND qx.questions_attempted > 0
            AND qx.hkt_practice_date IS NOT NULL
            AND qx.hkt_practice_date >= d1
            AND qx.hkt_practice_date <= d2
            AND sc.district = v_district
            AND (p_school_id IS NULL OR st.school_id = p_school_id)
            AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%')
          GROUP BY st.school_id
        ) a ON a.gsid = si.sid
      ),
      '{}'::jsonb
    ) INTO rates_obj;

    rates_data := rates_data || jsonb_build_array(
      jsonb_build_object(
        'key', sk,
        'by_school_id', coalesce(rates_obj, '{}'::jsonb)
      )
    );

    SELECT
      CASE
        WHEN coalesce(sum(qx.questions_attempted), 0) = 0 THEN 0
        ELSE round(
          (
            100.0
            * coalesce(sum(qx.score), 0)::numeric
            / coalesce(sum(qx.questions_attempted), 0)::numeric
          )::numeric,
          2
        )
      END
    INTO ch_pct
    FROM public.quiz_sessions qx
    JOIN public.students st ON st.id = qx.student_id
    JOIN public.schools sc ON sc.id = st.school_id
    JOIN public.parents p ON p.id = st.parent_id
    WHERE qx.student_id IS NOT NULL
      AND qx.questions_attempted > 0
      AND qx.hkt_practice_date IS NOT NULL
      AND qx.hkt_practice_date >= d1
      AND qx.hkt_practice_date <= d2
      AND sc.district = v_district
      AND (p_school_id IS NULL OR st.school_id = p_school_id)
      AND lower(trim(coalesce(qx.subject, ''))) IN ('chinese', 'chi', '中文', '中文科')
      AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

    SELECT
      CASE
        WHEN coalesce(sum(qx.questions_attempted), 0) = 0 THEN 0
        ELSE round(
          (
            100.0
            * coalesce(sum(qx.score), 0)::numeric
            / coalesce(sum(qx.questions_attempted), 0)::numeric
          )::numeric,
          2
        )
      END
    INTO en_pct
    FROM public.quiz_sessions qx
    JOIN public.students st ON st.id = qx.student_id
    JOIN public.schools sc ON sc.id = st.school_id
    JOIN public.parents p ON p.id = st.parent_id
    WHERE qx.student_id IS NOT NULL
      AND qx.questions_attempted > 0
      AND qx.hkt_practice_date IS NOT NULL
      AND qx.hkt_practice_date >= d1
      AND qx.hkt_practice_date <= d2
      AND sc.district = v_district
      AND (p_school_id IS NULL OR st.school_id = p_school_id)
      AND lower(trim(coalesce(qx.subject, ''))) IN ('english', 'eng', '英文', '英文科')
      AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

    SELECT
      CASE
        WHEN coalesce(sum(qx.questions_attempted), 0) = 0 THEN 0
        ELSE round(
          (
            100.0
            * coalesce(sum(qx.score), 0)::numeric
            / coalesce(sum(qx.questions_attempted), 0)::numeric
          )::numeric,
          2
        )
      END
    INTO ma_pct
    FROM public.quiz_sessions qx
    JOIN public.students st ON st.id = qx.student_id
    JOIN public.schools sc ON sc.id = st.school_id
    JOIN public.parents p ON p.id = st.parent_id
    WHERE qx.student_id IS NOT NULL
      AND qx.questions_attempted > 0
      AND qx.hkt_practice_date IS NOT NULL
      AND qx.hkt_practice_date >= d1
      AND qx.hkt_practice_date <= d2
      AND sc.district = v_district
      AND (p_school_id IS NULL OR st.school_id = p_school_id)
      AND lower(trim(coalesce(qx.subject, ''))) IN ('math', 'maths', 'mathematics', '數學', '數學科')
      AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

    rates_by_subject_data := rates_by_subject_data || jsonb_build_array(
      jsonb_build_object(
        'key', sk,
        'chinese', coalesce(ch_pct, 0),
        'english', coalesce(en_pct, 0),
        'math', coalesce(ma_pct, 0)
      )
    );

    SELECT jsonb_build_object(
      'P1', coalesce(sum(CASE WHEN upper(trim(coalesce(st.grade_level, ''))) = 'P1' THEN 1 ELSE 0 END), 0)::int,
      'P2', coalesce(sum(CASE WHEN upper(trim(coalesce(st.grade_level, ''))) = 'P2' THEN 1 ELSE 0 END), 0)::int,
      'P3', coalesce(sum(CASE WHEN upper(trim(coalesce(st.grade_level, ''))) = 'P3' THEN 1 ELSE 0 END), 0)::int,
      'P4', coalesce(sum(CASE WHEN upper(trim(coalesce(st.grade_level, ''))) = 'P4' THEN 1 ELSE 0 END), 0)::int,
      'P5', coalesce(sum(CASE WHEN upper(trim(coalesce(st.grade_level, ''))) = 'P5' THEN 1 ELSE 0 END), 0)::int,
      'P6', coalesce(sum(CASE WHEN upper(trim(coalesce(st.grade_level, ''))) = 'P6' THEN 1 ELSE 0 END), 0)::int
    )
    INTO grade_obj
    FROM public.students st
    JOIN public.schools sc ON sc.id = st.school_id
    JOIN public.parents p ON p.id = st.parent_id
    WHERE st.hkt_reg_date IS NOT NULL
      AND st.hkt_reg_date >= d1
      AND st.hkt_reg_date <= d2
      AND sc.district = v_district
      AND (p_school_id IS NULL OR st.school_id = p_school_id)
      AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

    grade_trend_data := grade_trend_data || jsonb_build_array(
      jsonb_build_object('key', sk) || coalesce(grade_obj, '{}'::jsonb)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'district', v_district,
    'school_id', CASE WHEN p_school_id IS NULL THEN NULL ELSE p_school_id::text END,
    'schools_students_by_grade', coalesce(schools_data, '[]'::jsonb),
    'school_monthly_correct_pct', rates_data,
    'subject_monthly_correct_pct', coalesce(rates_by_subject_data, '[]'::jsonb),
    'registrations_by_grade_12m', coalesce(grade_trend_data, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_business_school_details(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_business_school_details(text, uuid) TO service_role;

COMMIT;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('admin_today_business', 'admin_business_monthly_summary', 'admin_business_school_details')
ORDER BY routine_name;
