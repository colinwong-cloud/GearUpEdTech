-- ============================================================
-- Profile Update Feature: RPC functions
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Get full profile data for a parent (by mobile)
CREATE OR REPLACE FUNCTION get_parent_profile(p_mobile TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_result JSON;
BEGIN
  SELECT * INTO v_parent FROM parents WHERE mobile_number = p_mobile;
  IF v_parent IS NULL THEN RETURN NULL; END IF;

  SELECT json_build_object(
    'parent', json_build_object(
      'id', v_parent.id,
      'mobile_number', v_parent.mobile_number,
      'parent_name', v_parent.parent_name,
      'email', v_parent.email
    ),
    'students', COALESCE((
      SELECT json_agg(json_build_object(
        'id', s.id,
        'student_name', s.student_name,
        'pin_code', s.pin_code,
        'avatar_style', s.avatar_style,
        'grade_level', s.grade_level,
        'school_id', s.school_id
      ))
      FROM students s WHERE s.parent_id = v_parent.id
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 2. Update parent profile
CREATE OR REPLACE FUNCTION update_parent_profile(
  p_parent_id UUID,
  p_parent_name TEXT,
  p_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE parents SET
    parent_name = p_parent_name,
    email = p_email
  WHERE id = p_parent_id;
END;
$$;

-- 3. Update student profile
CREATE OR REPLACE FUNCTION update_student_profile(
  p_student_id UUID,
  p_student_name TEXT,
  p_pin_code TEXT,
  p_avatar_style TEXT,
  p_grade_level TEXT,
  p_school_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE students SET
    student_name = p_student_name,
    pin_code = p_pin_code,
    avatar_style = p_avatar_style,
    grade_level = p_grade_level,
    school_id = p_school_id
  WHERE id = p_student_id;
END;
$$;
