-- ============================================================
-- Security hardening: hashed PIN auth + admin privilege tightening
-- Run in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- 1) Migrate existing plaintext PINs to bcrypt hashes ----------
UPDATE students
SET pin_code = crypt(pin_code, gen_salt('bf'))
WHERE pin_code IS NOT NULL
  AND pin_code <> ''
  AND pin_code NOT LIKE '$2%';

-- ---------- 2) Register student with hashed PIN ----------
CREATE OR REPLACE FUNCTION register_student(
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
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_student RECORD;
  v_pin_hash TEXT;
  v_has_math BOOLEAN;
  v_has_chinese BOOLEAN;
  v_has_english BOOLEAN;
BEGIN
  IF p_pin_code IS NULL OR p_pin_code !~ '^[A-Za-z0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 alphanumeric characters';
  END IF;

  v_pin_hash := crypt(p_pin_code, gen_salt('bf'));

  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = p_mobile_number;
  IF v_parent_id IS NULL THEN
    INSERT INTO parents (mobile_number, email) VALUES (p_mobile_number, p_email) RETURNING id INTO v_parent_id;
  ELSE
    IF p_email IS NOT NULL AND p_email <> '' THEN
      UPDATE parents SET email = p_email WHERE id = v_parent_id AND (email IS NULL OR email = '');
    END IF;
  END IF;

  INSERT INTO students (parent_id, student_name, pin_code, avatar_style, grade_level, school_id)
  VALUES (v_parent_id, p_student_name, v_pin_hash, p_avatar_style, p_grade_level, p_school_id)
  RETURNING * INTO v_student;

  SELECT EXISTS (
    SELECT 1 FROM student_balances sb
    JOIN students st ON st.id = sb.student_id
    WHERE st.parent_id = v_parent_id
      AND lower(trim(sb.subject)) IN ('math', '數學')
  ) INTO v_has_math;

  IF NOT v_has_math THEN
    INSERT INTO student_balances (student_id, subject, remaining_questions)
    VALUES (v_student.id, 'Math', 300);
    INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description)
    VALUES (v_student.id, 'Math', 300, 300, '新用戶註冊贈送');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM student_balances sb
    JOIN students st ON st.id = sb.student_id
    WHERE st.parent_id = v_parent_id
      AND lower(trim(sb.subject)) = 'chinese'
  ) INTO v_has_chinese;

  IF NOT v_has_chinese THEN
    INSERT INTO student_balances (student_id, subject, remaining_questions)
    VALUES (v_student.id, 'Chinese', 300);
    INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description)
    VALUES (v_student.id, 'Chinese', 300, 300, '新用戶註冊贈送');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM student_balances sb
    JOIN students st ON st.id = sb.student_id
    WHERE st.parent_id = v_parent_id
      AND lower(trim(sb.subject)) = 'english'
  ) INTO v_has_english;

  IF NOT v_has_english THEN
    INSERT INTO student_balances (student_id, subject, remaining_questions)
    VALUES (v_student.id, 'English', 300);
    INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description)
    VALUES (v_student.id, 'English', 300, 300, '新用戶註冊贈送');
  END IF;

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

-- ---------- 3) Add student with hashed PIN ----------
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
  v_pin_hash TEXT;
BEGIN
  IF p_pin_code IS NULL OR p_pin_code !~ '^[A-Za-z0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 alphanumeric characters';
  END IF;

  v_pin_hash := crypt(p_pin_code, gen_salt('bf'));

  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = p_mobile_number;
  IF v_parent_id IS NULL THEN
    RETURN json_build_object('error', 'Parent not found');
  END IF;

  INSERT INTO students (parent_id, student_name, pin_code, avatar_style, grade_level, school_id)
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

-- ---------- 4) Login by mobile with server-side PIN verification ----------
CREATE OR REPLACE FUNCTION login_by_mobile(
  p_mobile_number TEXT,
  p_pin_code TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_students JSON;
BEGIN
  SELECT id INTO v_parent FROM parents WHERE mobile_number = p_mobile_number;
  IF v_parent IS NULL THEN
    RETURN json_build_object('parent_found', false, 'parent_id', null, 'students', '[]'::json);
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
    ) INTO v_students
    FROM students s
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
    ) INTO v_students
    FROM students s
    WHERE s.parent_id = v_parent.id
      AND s.pin_code = crypt(p_pin_code, s.pin_code);
  END IF;

  RETURN json_build_object(
    'parent_found', true,
    'parent_id', v_parent.id,
    'students', v_students
  );
END;
$$;

-- ---------- 5) Profile data should never include PIN hashes ----------
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
        'avatar_style', s.avatar_style,
        'grade_level', s.grade_level,
        'school_id', s.school_id,
        'gender', s.gender
      ))
      FROM students s WHERE s.parent_id = v_parent.id
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------- 6) Update profile with hashed PIN (single shared PIN across siblings) ----------
CREATE OR REPLACE FUNCTION update_student_profile(
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
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_pin_hash TEXT;
BEGIN
  IF p_pin_code IS NULL OR p_pin_code !~ '^[A-Za-z0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 alphanumeric characters';
  END IF;

  SELECT parent_id INTO v_parent_id FROM students WHERE id = p_student_id;
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_pin_hash := crypt(p_pin_code, gen_salt('bf'));

  -- Shared login PIN is intentionally synchronized across siblings.
  UPDATE students
  SET pin_code = v_pin_hash
  WHERE parent_id = v_parent_id;

  -- Profile fields should only update the selected student row.
  UPDATE students
  SET
    student_name = p_student_name,
    avatar_style = p_avatar_style,
    grade_level = p_grade_level,
    school_id = p_school_id,
    gender = NULLIF(UPPER(TRIM(p_gender)), '')
  WHERE id = p_student_id;
END;
$$;

-- ---------- 7) Password reset updates PIN as bcrypt hash ----------
CREATE OR REPLACE FUNCTION reset_password(p_token TEXT, p_new_pin TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reset RECORD;
BEGIN
  IF p_new_pin IS NULL OR p_new_pin !~ '^[A-Za-z0-9]{6}$' THEN
    RETURN json_build_object('success', false, 'reason', 'invalid_pin_format');
  END IF;

  SELECT * INTO v_reset FROM password_reset_tokens
  WHERE token = p_token AND used = false AND expires_at > NOW();

  IF v_reset IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'invalid_or_expired');
  END IF;

  UPDATE students
  SET pin_code = crypt(p_new_pin, gen_salt('bf'))
  WHERE parent_id = v_reset.parent_id;

  UPDATE password_reset_tokens SET used = true WHERE id = v_reset.id;

  RETURN json_build_object('success', true);
END;
$$;

-- ---------- 8) Restrict admin RPC execution to service_role only ----------
REVOKE EXECUTE ON FUNCTION public.admin_add_quota(uuid, text, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_search_parent(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_parent(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_settings() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_setting(text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_email_notification(text, boolean) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_search_questions(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_question(uuid, text, text, text, text, text, text, text) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_add_quota(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_parent(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_parent(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_settings() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_setting(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_email_notification(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_questions(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_question(uuid, text, text, text, text, text, text, text) TO service_role;
