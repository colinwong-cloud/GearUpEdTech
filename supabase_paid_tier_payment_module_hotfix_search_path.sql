-- ============================================================
-- HOTFIX: crypt()/gen_salt() resolution for SECURITY DEFINER RPCs
-- If you see: function crypt(text, text) does not exist
-- Run this in Supabase SQL Editor immediately.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.login_by_mobile(
  p_mobile_number TEXT,
  p_pin_code TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_parent RECORD;
  v_students JSON;
  v_tier JSON;
BEGIN
  SELECT id, mobile_number, paid_until, subscription_tier
  INTO v_parent
  FROM public.parents
  WHERE mobile_number = p_mobile_number;

  IF v_parent IS NULL THEN
    RETURN json_build_object(
      'parent_found', false,
      'parent_id', null,
      'students', '[]'::json
    );
  END IF;

  IF p_pin_code IS NULL THEN
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id', s.id,
          'parent_id', s.parent_id,
          'student_name', s.student_name,
          'avatar_style', s.avatar_style,
          'grade_level', s.grade_level,
          'created_at', s.created_at,
          'gender', s.gender
        )
      ),
      '[]'::json
    )
    INTO v_students
    FROM public.students s
    WHERE s.parent_id = v_parent.id;
  ELSE
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id', s.id,
          'parent_id', s.parent_id,
          'student_name', s.student_name,
          'avatar_style', s.avatar_style,
          'grade_level', s.grade_level,
          'created_at', s.created_at,
          'gender', s.gender
        )
      ),
      '[]'::json
    )
    INTO v_students
    FROM public.students s
    WHERE s.parent_id = v_parent.id
      AND s.pin_code = crypt(p_pin_code, s.pin_code);
  END IF;

  SELECT public.get_parent_tier_status(p_mobile_number) INTO v_tier;

  RETURN json_build_object(
    'parent_found', true,
    'parent_id', v_parent.id,
    'students', v_students,
    'tier', coalesce(v_tier->>'tier', 'free'),
    'is_paid', coalesce((v_tier->>'is_paid')::BOOLEAN, false),
    'paid_until', v_tier->>'paid_until',
    'tier_label', coalesce(v_tier->>'tier_label', '免費用戶')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_student(
  p_mobile_number TEXT,
  p_student_name TEXT,
  p_pin_code TEXT,
  p_avatar_style TEXT,
  p_grade_level TEXT,
  p_email TEXT DEFAULT NULL,
  p_school_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_parent_id UUID;
  v_student RECORD;
  v_pin_hash TEXT;
BEGIN
  IF p_pin_code IS NULL OR p_pin_code !~ '^[A-Za-z0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 alphanumeric characters';
  END IF;

  v_pin_hash := crypt(p_pin_code, gen_salt('bf'));

  SELECT id
  INTO v_parent_id
  FROM public.parents
  WHERE mobile_number = p_mobile_number;

  IF v_parent_id IS NULL THEN
    INSERT INTO public.parents (mobile_number, email, subscription_tier)
    VALUES (p_mobile_number, p_email, 'free')
    RETURNING id INTO v_parent_id;
  ELSE
    IF p_email IS NOT NULL AND p_email <> '' THEN
      UPDATE public.parents
      SET email = p_email
      WHERE id = v_parent_id
        AND (email IS NULL OR email = '');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.parent_id = v_parent_id
      AND upper(trim(s.grade_level)) = upper(trim(p_grade_level))
  ) THEN
    RAISE EXCEPTION '因系統紀錄已有同年級學生而未能添加，如有查詢，請電郵至 cs@hkedutech.com';
  END IF;

  INSERT INTO public.students (parent_id, student_name, pin_code, avatar_style, grade_level, school_id)
  VALUES (v_parent_id, p_student_name, v_pin_hash, p_avatar_style, p_grade_level, p_school_id)
  RETURNING * INTO v_student;

  RETURN json_build_object(
    'id', v_student.id,
    'parent_id', v_student.parent_id,
    'student_name', v_student.student_name,
    'avatar_style', v_student.avatar_style,
    'grade_level', v_student.grade_level,
    'created_at', v_student.created_at,
    'gender', v_student.gender
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_student_to_parent(
  p_mobile_number TEXT,
  p_student_name TEXT,
  p_pin_code TEXT,
  p_avatar_style TEXT,
  p_grade_level TEXT,
  p_school_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_parent_id UUID;
  v_student RECORD;
  v_pin_hash TEXT;
BEGIN
  IF p_pin_code IS NULL OR p_pin_code !~ '^[A-Za-z0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 alphanumeric characters';
  END IF;

  v_pin_hash := crypt(p_pin_code, gen_salt('bf'));

  SELECT id
  INTO v_parent_id
  FROM public.parents
  WHERE mobile_number = p_mobile_number;

  IF v_parent_id IS NULL THEN
    RETURN json_build_object('error', 'Parent not found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.parent_id = v_parent_id
      AND upper(trim(s.grade_level)) = upper(trim(p_grade_level))
  ) THEN
    RAISE EXCEPTION '因系統紀錄已有同年級學生而未能添加，如有查詢，請電郵至 cs@hkedutech.com';
  END IF;

  INSERT INTO public.students (parent_id, student_name, pin_code, avatar_style, grade_level, school_id)
  VALUES (v_parent_id, p_student_name, v_pin_hash, p_avatar_style, p_grade_level, p_school_id)
  RETURNING * INTO v_student;

  RETURN json_build_object(
    'id', v_student.id,
    'parent_id', v_student.parent_id,
    'student_name', v_student.student_name,
    'avatar_style', v_student.avatar_style,
    'grade_level', v_student.grade_level,
    'created_at', v_student.created_at,
    'gender', v_student.gender
  );
END;
$$;
