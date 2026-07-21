-- ============================================================
-- Balance View Feature: parent-level balance + grouped daily transactions
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
      md5(
        to_char(date_trunc('day', bt.created_at), 'YYYY-MM-DD')
        || '|' || lower(trim(bt.subject))
      ) AS id,
      SUM(bt.change_amount)::int AS change_amount,
      NULL::int AS balance_after,
      CASE
        WHEN SUM(bt.change_amount) < 0 THEN '練習作答扣除（按日）'
        WHEN SUM(bt.change_amount) > 0 THEN '新增題目（按日）'
        ELSE '題目調整（按日）'
      END AS description,
      NULL::uuid AS session_id,
      date_trunc('day', bt.created_at) AS created_at,
      trim(bt.subject) AS subject
    FROM balance_transactions bt
    WHERE bt.student_id = ANY(v_student_ids)
      AND lower(bt.subject) = lower(p_subject)
      AND bt.created_at >= v_start
      AND bt.created_at < v_end
    GROUP BY date_trunc('day', bt.created_at), lower(trim(bt.subject)), trim(bt.subject)
  ) t;

  RETURN json_build_object(
    'total_balance', v_total_balance,
    'opening_balance', v_opening_balance,
    'transactions', v_transactions
  );
END;
$$;
