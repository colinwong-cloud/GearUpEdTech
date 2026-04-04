-- ============================================================
-- RPC functions for the GearUp Quiz app
-- Run this in Supabase Dashboard > SQL Editor
-- These functions use SECURITY DEFINER so they bypass RLS,
-- allowing the anon role to perform controlled writes only.
-- ============================================================

-- 1. Register a new user: find-or-create parent, create student
CREATE OR REPLACE FUNCTION register_student(
  p_mobile_number TEXT,
  p_student_name TEXT,
  p_pin_code TEXT,
  p_avatar_style TEXT,
  p_grade_level TEXT
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
  -- Find or create parent
  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = p_mobile_number;
  IF v_parent_id IS NULL THEN
    INSERT INTO parents (mobile_number) VALUES (p_mobile_number) RETURNING id INTO v_parent_id;
  END IF;

  -- Create student
  INSERT INTO students (parent_id, student_name, pin_code, avatar_style, grade_level)
  VALUES (v_parent_id, p_student_name, p_pin_code, p_avatar_style, p_grade_level)
  RETURNING * INTO v_student;

  RETURN row_to_json(v_student);
END;
$$;

-- 2. Create a quiz session
CREATE OR REPLACE FUNCTION create_quiz_session(
  p_student_id UUID,
  p_subject TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
BEGIN
  INSERT INTO quiz_sessions (student_id, subject, questions_attempted, score, time_spent_seconds)
  VALUES (p_student_id, p_subject, 0, 0, 0)
  RETURNING * INTO v_session;

  RETURN row_to_json(v_session);
END;
$$;

-- 3. Submit an answer
CREATE OR REPLACE FUNCTION submit_answer(
  p_session_id UUID,
  p_question_id UUID,
  p_student_answer TEXT,
  p_is_correct BOOLEAN,
  p_question_order INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO session_answers (session_id, question_id, student_answer, is_correct, question_order)
  VALUES (p_session_id, p_question_id, p_student_answer, p_is_correct, p_question_order);
END;
$$;

-- 4. Update quiz session progress
CREATE OR REPLACE FUNCTION update_quiz_session(
  p_session_id UUID,
  p_questions_attempted INTEGER,
  p_score INTEGER,
  p_time_spent_seconds INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE quiz_sessions
  SET questions_attempted = p_questions_attempted,
      score = p_score,
      time_spent_seconds = p_time_spent_seconds
  WHERE id = p_session_id;
END;
$$;

-- 5. Deduct student balance
CREATE OR REPLACE FUNCTION deduct_student_balance(
  p_balance_id UUID,
  p_amount INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE student_balances
  SET remaining_questions = GREATEST(0, remaining_questions - p_amount)
  WHERE id = p_balance_id;
END;
$$;

-- 6. Update or create rank performance
CREATE OR REPLACE FUNCTION upsert_rank_performance(
  p_student_id UUID,
  p_subject TEXT,
  p_paper_rank TEXT,
  p_attempted INTEGER,
  p_correct INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  SELECT id INTO v_existing_id
  FROM student_rank_performance
  WHERE student_id = p_student_id
    AND lower(subject) = lower(p_subject)
    AND paper_rank = p_paper_rank;

  IF v_existing_id IS NOT NULL THEN
    UPDATE student_rank_performance
    SET questions_attempted = student_rank_performance.questions_attempted + p_attempted,
        questions_correct = student_rank_performance.questions_correct + p_correct,
        last_updated = NOW()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO student_rank_performance (student_id, subject, paper_rank, questions_attempted, questions_correct)
    VALUES (p_student_id, p_subject, p_paper_rank, p_attempted, p_correct);
  END IF;
END;
$$;
