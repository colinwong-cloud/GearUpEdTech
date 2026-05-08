-- Hotfix: extend admin_business_school_details for school-level KPI charts
-- Adds:
-- 1) subject_monthly_correct_pct (Chinese / English / Math)
-- 2) registrations_by_grade_12m (P1-P6 lines)

BEGIN;

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
          WHERE s4.school_id = sc.id
          GROUP BY s4.grade_level
        ) gg
      ) AS by_grade
    FROM public.schools sc
    WHERE sc.district = v_district
      AND EXISTS (SELECT 1 FROM public.students s5 WHERE s5.school_id = sc.id)
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
          WHERE s.school_id IS NOT NULL
            AND sc.district = v_district
            AND (p_school_id IS NULL OR s.school_id = p_school_id)
        ) si
        LEFT JOIN (
          SELECT
            st.school_id AS gsid,
            coalesce(sum(qx.questions_attempted), 0)::bigint AS tq,
            coalesce(sum(qx.score), 0)::bigint AS correct_sum
          FROM public.quiz_sessions qx
          JOIN public.students st ON st.id = qx.student_id
          JOIN public.schools sc ON sc.id = st.school_id
          WHERE qx.student_id IS NOT NULL
            AND qx.questions_attempted > 0
            AND qx.hkt_practice_date IS NOT NULL
            AND qx.hkt_practice_date >= d1
            AND qx.hkt_practice_date <= d2
            AND sc.district = v_district
            AND (p_school_id IS NULL OR st.school_id = p_school_id)
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
    WHERE qx.student_id IS NOT NULL
      AND qx.questions_attempted > 0
      AND qx.hkt_practice_date IS NOT NULL
      AND qx.hkt_practice_date >= d1
      AND qx.hkt_practice_date <= d2
      AND sc.district = v_district
      AND (p_school_id IS NULL OR st.school_id = p_school_id)
      AND lower(trim(coalesce(qx.subject, ''))) IN ('chinese', 'chi', '中文', '中文科');

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
    WHERE qx.student_id IS NOT NULL
      AND qx.questions_attempted > 0
      AND qx.hkt_practice_date IS NOT NULL
      AND qx.hkt_practice_date >= d1
      AND qx.hkt_practice_date <= d2
      AND sc.district = v_district
      AND (p_school_id IS NULL OR st.school_id = p_school_id)
      AND lower(trim(coalesce(qx.subject, ''))) IN ('english', 'eng', '英文', '英文科');

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
    WHERE qx.student_id IS NOT NULL
      AND qx.questions_attempted > 0
      AND qx.hkt_practice_date IS NOT NULL
      AND qx.hkt_practice_date >= d1
      AND qx.hkt_practice_date <= d2
      AND sc.district = v_district
      AND (p_school_id IS NULL OR st.school_id = p_school_id)
      AND lower(trim(coalesce(qx.subject, ''))) IN ('math', 'maths', 'mathematics', '數學', '數學科');

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
    WHERE st.hkt_reg_date IS NOT NULL
      AND st.hkt_reg_date >= d1
      AND st.hkt_reg_date <= d2
      AND sc.district = v_district
      AND (p_school_id IS NULL OR st.school_id = p_school_id);

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
