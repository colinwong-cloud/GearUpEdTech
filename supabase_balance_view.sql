-- ============================================================
-- Balance View Feature: parent-level balance + transactions with student names
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION get_parent_balance_view(
  p_mobile TEXT,
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
  v_parent_id UUID;
  v_student_ids UUID[];
  v_total_balance INTEGER;
  v_opening_balance INTEGER;
  v_transactions JSON;
  v_start DATE;
  v_end DATE;
BEGIN
  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = p_mobile;
  IF v_parent_id IS NULL THEN RETURN NULL; END IF;

  SELECT array_agg(id) INTO v_student_ids FROM students WHERE parent_id = v_parent_id;
  IF v_student_ids IS NULL THEN RETURN json_build_object('total_balance', 0, 'opening_balance', 0, 'transactions', '[]'::json); END IF;

  SELECT COALESCE(SUM(remaining_questions), 0) INTO v_total_balance
  FROM student_balances
  WHERE student_id = ANY(v_student_ids) AND lower(subject) = lower(p_subject);

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month')::DATE;

  SELECT COALESCE(
    (SELECT balance_after FROM balance_transactions
     WHERE student_id = ANY(v_student_ids) AND lower(subject) = lower(p_subject)
       AND created_at < v_start
     ORDER BY created_at DESC LIMIT 1),
    0
  ) INTO v_opening_balance;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at), '[]'::json)
  INTO v_transactions
  FROM (
    SELECT
      bt.id,
      bt.change_amount,
      bt.balance_after,
      bt.description,
      bt.session_id,
      bt.created_at,
      s.student_name
    FROM balance_transactions bt
    JOIN students s ON s.id = bt.student_id
    WHERE bt.student_id = ANY(v_student_ids)
      AND lower(bt.subject) = lower(p_subject)
      AND bt.created_at >= v_start
      AND bt.created_at < v_end
  ) t;

  RETURN json_build_object(
    'total_balance', v_total_balance,
    'opening_balance', v_opening_balance,
    'transactions', v_transactions
  );
END;
$$;
