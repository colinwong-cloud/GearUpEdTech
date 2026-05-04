-- ============================================================
-- HOTFIX: prevent cross-student grade overwrite on profile save
-- Run in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.update_student_profile(
  p_student_id UUID,
  p_student_name TEXT,
  p_pin_code TEXT,
  p_avatar_style TEXT,
  p_grade_level TEXT,
  p_school_id UUID DEFAULT NULL,
  p_gender TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_parent_id UUID;
  v_pin_hash TEXT;
BEGIN
  IF p_pin_code IS NULL OR p_pin_code !~ '^[A-Za-z0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 alphanumeric characters';
  END IF;

  SELECT parent_id INTO v_parent_id FROM public.students WHERE id = p_student_id;
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.parent_id = v_parent_id
      AND s.id <> p_student_id
      AND upper(trim(s.grade_level)) = upper(trim(p_grade_level))
  ) THEN
    RAISE EXCEPTION '每個年級只可新增一位學生';
  END IF;

  v_pin_hash := crypt(p_pin_code, gen_salt('bf'));

  -- Keep shared PIN across siblings, but update profile fields only for target student.
  UPDATE public.students
  SET pin_code = v_pin_hash
  WHERE parent_id = v_parent_id;

  UPDATE public.students
  SET
    student_name = p_student_name,
    avatar_style = p_avatar_style,
    grade_level = p_grade_level,
    school_id = p_school_id,
    gender = NULLIF(UPPER(TRIM(p_gender)), '')
  WHERE id = p_student_id;
END;
$$;
