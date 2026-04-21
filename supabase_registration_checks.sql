-- ============================================================
-- Registration Checks: email uniqueness
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION check_email_exists(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM parents WHERE lower(email) = lower(p_email)) THEN
    RETURN json_build_object('exists', true);
  END IF;
  RETURN json_build_object('exists', false);
END;
$$;
