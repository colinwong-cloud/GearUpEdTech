-- ============================================================
-- Admin Console: tables + RPC functions
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Admin settings table (key-value store for global toggles)
CREATE TABLE IF NOT EXISTS admin_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO admin_settings (key, value) VALUES ('email_notifications_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- 2. Add email notification toggle to parents
ALTER TABLE parents ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;

-- 3. Admin: add quota to student balance
CREATE OR REPLACE FUNCTION admin_add_quota(
  p_student_id UUID,
  p_subject TEXT,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance RECORD;
  v_new_bal INTEGER;
BEGIN
  SELECT * INTO v_balance FROM student_balances
  WHERE student_id = p_student_id AND lower(subject) = lower(p_subject);

  IF v_balance IS NULL THEN
    INSERT INTO student_balances (student_id, subject, remaining_questions)
    VALUES (p_student_id, p_subject, p_amount);
    INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description)
    VALUES (p_student_id, p_subject, p_amount, p_amount, '管理員手動增加');
    RETURN json_build_object('remaining_questions', p_amount);
  END IF;

  v_new_bal := v_balance.remaining_questions + p_amount;
  UPDATE student_balances SET remaining_questions = v_new_bal WHERE id = v_balance.id;
  INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description)
  VALUES (p_student_id, p_subject, p_amount, v_new_bal, '管理員手動增加');
  RETURN json_build_object('remaining_questions', v_new_bal);
END;
$$;

-- 4. Admin: search parent by mobile, return parent + students + balances
CREATE OR REPLACE FUNCTION admin_search_parent(p_mobile TEXT)
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
    'parent', row_to_json(v_parent),
    'students', COALESCE((
      SELECT json_agg(json_build_object(
        'student', row_to_json(s),
        'balances', (SELECT COALESCE(json_agg(row_to_json(b)), '[]'::json) FROM student_balances b WHERE b.student_id = s.id)
      ))
      FROM students s WHERE s.parent_id = v_parent.id
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 5. Admin: delete parent and ALL related records
CREATE OR REPLACE FUNCTION admin_delete_parent(p_mobile TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_student_ids UUID[];
  v_count INTEGER;
BEGIN
  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = p_mobile;
  IF v_parent_id IS NULL THEN
    RETURN json_build_object('deleted', false, 'reason', 'Parent not found');
  END IF;

  SELECT array_agg(id) INTO v_student_ids FROM students WHERE parent_id = v_parent_id;

  IF v_student_ids IS NOT NULL THEN
    DELETE FROM session_answers WHERE session_id IN (SELECT id FROM quiz_sessions WHERE student_id = ANY(v_student_ids));
    DELETE FROM quiz_sessions WHERE student_id = ANY(v_student_ids);
    DELETE FROM balance_transactions WHERE student_id = ANY(v_student_ids);
    DELETE FROM student_balances WHERE student_id = ANY(v_student_ids);
    DELETE FROM student_rank_performance WHERE student_id = ANY(v_student_ids);
    DELETE FROM parent_weights WHERE student_id = ANY(v_student_ids);
    DELETE FROM question_reports WHERE student_id = ANY(v_student_ids);
    DELETE FROM students WHERE parent_id = v_parent_id;
  END IF;

  DELETE FROM parents WHERE id = v_parent_id;

  v_count := COALESCE(array_length(v_student_ids, 1), 0);
  RETURN json_build_object('deleted', true, 'students_deleted', v_count);
END;
$$;

-- 6. Admin: get/set global email notification setting
CREATE OR REPLACE FUNCTION admin_get_settings()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT json_object_agg(key, value) FROM admin_settings);
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_setting(p_key TEXT, p_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO admin_settings (key, value) VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET value = p_value;
END;
$$;

-- 7. Admin: toggle email notification per parent email
CREATE OR REPLACE FUNCTION admin_set_email_notification(p_email TEXT, p_enabled BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE parents SET email_notifications_enabled = p_enabled WHERE email = p_email;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN json_build_object('updated', v_count);
END;
$$;

-- 8. Admin: search questions by ID or content
CREATE OR REPLACE FUNCTION admin_search_questions(p_query TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT json_agg(row_to_json(q))
    FROM (
      SELECT id, subject, question_type, paper_rank, grade_level, content,
             opt_a, opt_b, opt_c, opt_d, correct_answer, explanation, image_url
      FROM questions
      WHERE id::text = p_query OR content ILIKE '%' || p_query || '%'
      ORDER BY created_at DESC
      LIMIT 20
    ) q
  ), '[]'::json);
END;
$$;

-- 9. Update get_quiz_email_data to include notification preference
CREATE OR REPLACE FUNCTION get_quiz_email_data(
  p_student_id UUID,
  p_session_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'parent_name', p.parent_name,
    'parent_email', p.email,
    'email_notifications_enabled', COALESCE(p.email_notifications_enabled, true),
    'student_name', s.student_name,
    'session', json_build_object(
      'id', qs.id,
      'subject', qs.subject,
      'questions_attempted', qs.questions_attempted,
      'score', qs.score,
      'time_spent_seconds', qs.time_spent_seconds,
      'created_at', qs.created_at
    ),
    'weekly_count', (
      SELECT COUNT(*)::int FROM quiz_sessions
      WHERE student_id = p_student_id
        AND created_at >= date_trunc('week', NOW())
    ),
    'type_breakdown', COALESCE((
      SELECT json_agg(row_to_json(tb))
      FROM (
        SELECT
          q.question_type,
          COUNT(*)::int AS total,
          SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
        FROM session_answers sa
        JOIN questions q ON q.id = sa.question_id
        WHERE sa.session_id = p_session_id
        GROUP BY q.question_type
        ORDER BY q.question_type
      ) tb
    ), '[]'::json)
  ) INTO v_result
  FROM students s
  JOIN parents p ON p.id = s.parent_id
  JOIN quiz_sessions qs ON qs.id = p_session_id AND qs.student_id = p_student_id
  WHERE s.id = p_student_id;

  RETURN v_result;
END;
$$;

-- 10. Admin: update a question
CREATE OR REPLACE FUNCTION admin_update_question(
  p_id UUID,
  p_content TEXT,
  p_opt_a TEXT,
  p_opt_b TEXT,
  p_opt_c TEXT,
  p_opt_d TEXT,
  p_correct_answer TEXT,
  p_explanation TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE questions SET
    content = p_content,
    opt_a = p_opt_a,
    opt_b = p_opt_b,
    opt_c = p_opt_c,
    opt_d = p_opt_d,
    correct_answer = p_correct_answer,
    explanation = p_explanation
  WHERE id = p_id;
END;
$$;
