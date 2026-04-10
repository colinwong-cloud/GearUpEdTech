-- ============================================================
-- Balance Feature: transactions table + updated RPC functions
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Create balance_transactions table
CREATE TABLE IF NOT EXISTS balance_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES students(id),
  subject         TEXT NOT NULL,
  change_amount   INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  description     TEXT NOT NULL,
  session_id      UUID REFERENCES quiz_sessions(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;

-- 2. Update student_balances default from 300 to 30
ALTER TABLE student_balances ALTER COLUMN remaining_questions SET DEFAULT 30;

-- 3. Update register_student to create initial balance + log transaction
CREATE OR REPLACE FUNCTION register_student(
  p_mobile_number TEXT,
  p_student_name TEXT,
  p_pin_code TEXT,
  p_avatar_style TEXT,
  p_grade_level TEXT,
  p_email TEXT DEFAULT NULL
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
    INSERT INTO parents (mobile_number, email) VALUES (p_mobile_number, p_email) RETURNING id INTO v_parent_id;
  ELSE
    IF p_email IS NOT NULL AND p_email <> '' THEN
      UPDATE parents SET email = p_email WHERE id = v_parent_id AND (email IS NULL OR email = '');
    END IF;
  END IF;

  INSERT INTO students (parent_id, student_name, pin_code, avatar_style, grade_level)
  VALUES (v_parent_id, p_student_name, p_pin_code, p_avatar_style, p_grade_level)
  RETURNING * INTO v_student;

  INSERT INTO student_balances (student_id, subject, remaining_questions)
  VALUES (v_student.id, '數學', 30);

  INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description)
  VALUES (v_student.id, '數學', 30, 30, '新用戶註冊贈送');

  RETURN row_to_json(v_student);
END;
$$;

-- 4. Update deduct_student_balance to log transaction
CREATE OR REPLACE FUNCTION deduct_student_balance(
  p_balance_id UUID,
  p_amount INTEGER,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
  v_new_balance INTEGER;
BEGIN
  SELECT * INTO v_record FROM student_balances WHERE id = p_balance_id;
  IF v_record IS NULL THEN
    RETURN NULL;
  END IF;

  v_new_balance := GREATEST(0, v_record.remaining_questions - p_amount);

  UPDATE student_balances
  SET remaining_questions = v_new_balance
  WHERE id = p_balance_id;

  INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description, session_id)
  VALUES (v_record.student_id, v_record.subject, -p_amount, v_new_balance, '完成練習扣除', p_session_id);

  RETURN json_build_object('remaining_questions', v_new_balance);
END;
$$;

-- 5. Get balance transactions for a month
CREATE OR REPLACE FUNCTION get_balance_transactions(
  p_student_id UUID,
  p_subject TEXT,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_transactions JSON;
  v_opening_balance INTEGER;
  v_current_balance INTEGER;
BEGIN
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month')::DATE;

  SELECT COALESCE(
    (SELECT balance_after FROM balance_transactions
     WHERE student_id = p_student_id AND lower(subject) = lower(p_subject)
       AND created_at < v_start
     ORDER BY created_at DESC LIMIT 1),
    0
  ) INTO v_opening_balance;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at), '[]'::json)
  INTO v_transactions
  FROM (
    SELECT id, change_amount, balance_after, description, session_id, created_at
    FROM balance_transactions
    WHERE student_id = p_student_id
      AND lower(subject) = lower(p_subject)
      AND created_at >= v_start
      AND created_at < v_end
  ) t;

  SELECT COALESCE(remaining_questions, 0) INTO v_current_balance
  FROM student_balances
  WHERE student_id = p_student_id AND lower(subject) = lower(p_subject);

  IF v_current_balance IS NULL THEN
    v_current_balance := 0;
  END IF;

  RETURN json_build_object(
    'opening_balance', v_opening_balance,
    'current_balance', v_current_balance,
    'transactions', v_transactions
  );
END;
$$;

-- 6. Get student balance (SECURITY DEFINER for RLS-protected table)
CREATE OR REPLACE FUNCTION get_student_balance(
  p_student_id UUID,
  p_subject TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance RECORD;
BEGIN
  SELECT * INTO v_balance
  FROM student_balances
  WHERE student_id = p_student_id AND lower(subject) = lower(p_subject);

  IF v_balance IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN row_to_json(v_balance);
END;
$$;
