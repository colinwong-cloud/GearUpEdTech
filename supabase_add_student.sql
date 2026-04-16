-- ============================================================
-- Add Student Feature: RPC function
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION add_student_to_parent(
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
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_student RECORD;
BEGIN
  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = p_mobile_number;
  IF v_parent_id IS NULL THEN
    RETURN json_build_object('error', 'Parent not found');
  END IF;

  INSERT INTO students (parent_id, student_name, pin_code, avatar_style, grade_level, school_id)
  VALUES (v_parent_id, p_student_name, p_pin_code, p_avatar_style, p_grade_level, p_school_id)
  RETURNING * INTO v_student;

  RETURN row_to_json(v_student);
END;
$$;
