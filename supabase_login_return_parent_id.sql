-- Add parent_id to login_by_mobile result (no breaking change: extra field)
CREATE OR REPLACE FUNCTION public.login_by_mobile(
  p_mobile_number TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_students JSON;
BEGIN
  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = p_mobile_number;
  IF v_parent_id IS NULL THEN
    RETURN json_build_object('parent_found', false, 'parent_id', null, 'students', '[]'::json);
  END IF;

  SELECT json_agg(row_to_json(s)) INTO v_students
  FROM students s
  WHERE s.parent_id = v_parent_id;

  RETURN json_build_object(
    'parent_found', true,
    'parent_id', v_parent_id,
    'students', COALESCE(v_students, '[]'::json)
  );
END;
$$;
