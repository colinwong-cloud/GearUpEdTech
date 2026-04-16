-- ============================================================
-- Password Reset Feature
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Token table for password reset
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID NOT NULL REFERENCES parents(id),
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- 2. Verify email belongs to a parent, create reset token
CREATE OR REPLACE FUNCTION create_password_reset(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_token TEXT;
BEGIN
  SELECT * INTO v_parent FROM parents WHERE email = p_email;
  IF v_parent IS NULL THEN
    RETURN json_build_object('found', false);
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO password_reset_tokens (parent_id, token, expires_at)
  VALUES (v_parent.id, v_token, NOW() + INTERVAL '1 hour');

  RETURN json_build_object(
    'found', true,
    'token', v_token,
    'parent_name', v_parent.parent_name,
    'mobile_number', v_parent.mobile_number
  );
END;
$$;

-- 3. Validate token and reset password
CREATE OR REPLACE FUNCTION reset_password(p_token TEXT, p_new_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reset RECORD;
BEGIN
  SELECT * INTO v_reset FROM password_reset_tokens
  WHERE token = p_token AND used = false AND expires_at > NOW();

  IF v_reset IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'invalid_or_expired');
  END IF;

  UPDATE students SET pin_code = p_new_pin WHERE parent_id = v_reset.parent_id;

  UPDATE password_reset_tokens SET used = true WHERE id = v_reset.id;

  RETURN json_build_object('success', true);
END;
$$;
