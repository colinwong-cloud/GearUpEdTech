-- ============================================================
-- HOTFIX: clarify duplicate-grade add-student error message
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
