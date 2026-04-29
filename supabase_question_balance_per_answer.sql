-- ============================================================
-- Question balance: per-answer deduction + shared parent pool
-- Run in Supabase SQL Editor (idempotent where possible).
--
-- Fixes:
-- 1) Deduct 1 balance per answered question (not only at session end).
-- 2) Insufficient balance blocks submit_answer (raises exception).
-- 3) Parent "total" = SUM of sibling rows; deduction drains current
--    student's row first, then siblings (shared pool).
-- 4) balance_transactions log the student who practiced (session) and
--    balance_after = family total remaining after the change.
-- 5) get_parent_balance_view / opening_balance: subject filter matches
--    Math and legacy 數學 so history is not empty after subject rename.
-- 6) register_student: initial gift only if no sibling already has a
--    balance row for that subject (avoids doubling the pool per child).
-- ============================================================

-- ---------- Helpers: subject match (Math <-> 數學) ----------
-- Used inline in functions below.

-- ---------- Merge duplicate Math / 數學 rows per student (one row left) ----------
UPDATE student_balances sb_math
SET remaining_questions = sb_math.remaining_questions + COALESCE(leg.sum_legacy, 0)
FROM (
  SELECT sb_legacy.student_id, SUM(sb_legacy.remaining_questions)::int AS sum_legacy
  FROM student_balances sb_legacy
  WHERE trim(sb_legacy.subject) = '數學'
    AND EXISTS (
      SELECT 1 FROM student_balances m
      WHERE m.student_id = sb_legacy.student_id
        AND lower(trim(m.subject)) = 'math'
    )
  GROUP BY sb_legacy.student_id
) leg
WHERE leg.student_id = sb_math.student_id
  AND lower(trim(sb_math.subject)) = 'math';

DELETE FROM student_balances sb
WHERE trim(sb.subject) = '數學'
  AND EXISTS (
    SELECT 1 FROM student_balances m
    WHERE m.student_id = sb.student_id
      AND lower(trim(m.subject)) = 'math'
  );

UPDATE student_balances
SET subject = 'Math'
WHERE trim(subject) = '數學';

UPDATE balance_transactions
SET subject = 'Math'
WHERE trim(subject) = '數學';

-- ---------- get_student_balance: SUM across siblings, canonical Math ----------
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
  v_parent_id UUID;
  v_sum INTEGER;
  v_own_id UUID;
  v_key TEXT;
BEGIN
  SELECT s.parent_id INTO v_parent_id
  FROM students s WHERE s.id = p_student_id;

  IF v_parent_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_key := lower(trim(p_subject));

  SELECT COALESCE(SUM(sb.remaining_questions), 0)
  INTO v_sum
  FROM student_balances sb
  JOIN students st ON st.id = sb.student_id
  WHERE st.parent_id = v_parent_id
    AND (
      lower(trim(sb.subject)) = v_key
      OR (v_key = 'math' AND lower(trim(sb.subject)) IN ('math', '數學'))
    );

  IF v_sum = 0 AND NOT EXISTS (
    SELECT 1 FROM student_balances sb2
    JOIN students st2 ON st2.id = sb2.student_id
    WHERE st2.parent_id = v_parent_id
      AND (
        lower(trim(sb2.subject)) = v_key
        OR (v_key = 'math' AND lower(trim(sb2.subject)) IN ('math', '數學'))
      )
  ) THEN
    RETURN NULL;
  END IF;

  SELECT sb.id INTO v_own_id
  FROM student_balances sb
  WHERE sb.student_id = p_student_id
    AND (
      lower(trim(sb.subject)) = v_key
      OR (v_key = 'math' AND lower(trim(sb.subject)) IN ('math', '數學'))
    )
  ORDER BY CASE WHEN lower(trim(sb.subject)) = 'math' THEN 0 WHEN trim(sb.subject) = 'Math' THEN 1 ELSE 2 END
  LIMIT 1;

  RETURN json_build_object(
    'id', COALESCE(v_own_id, (SELECT sb3.id FROM student_balances sb3
      JOIN students st3 ON st3.id = sb3.student_id
      WHERE st3.parent_id = v_parent_id
        AND (lower(trim(sb3.subject)) = v_key OR (v_key = 'math' AND lower(trim(sb3.subject)) IN ('math', '數學')))
      ORDER BY sb3.remaining_questions DESC NULLS LAST
      LIMIT 1)),
    'student_id', p_student_id,
    'subject', trim(p_subject),
    'remaining_questions', v_sum
  );
END;
$$;

-- ---------- get_parent_balance_view: subject OR Math/數學 ----------
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
  v_key TEXT;
BEGIN
  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = p_mobile;
  IF v_parent_id IS NULL THEN RETURN NULL; END IF;

  SELECT array_agg(id) INTO v_student_ids FROM students WHERE parent_id = v_parent_id;
  IF v_student_ids IS NULL THEN RETURN json_build_object('total_balance', 0, 'opening_balance', 0, 'transactions', '[]'::json); END IF;

  v_key := lower(trim(p_subject));

  SELECT COALESCE(SUM(sb.remaining_questions), 0) INTO v_total_balance
  FROM student_balances sb
  WHERE sb.student_id = ANY(v_student_ids)
    AND (
      lower(trim(sb.subject)) = v_key
      OR (v_key = 'math' AND lower(trim(sb.subject)) IN ('math', '數學'))
    );

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month')::DATE;

  SELECT COALESCE(
    (SELECT bt.balance_after FROM balance_transactions bt
     WHERE bt.student_id = ANY(v_student_ids)
       AND (
         lower(trim(bt.subject)) = v_key
         OR (v_key = 'math' AND lower(trim(bt.subject)) IN ('math', '數學'))
       )
       AND bt.created_at < v_start
     ORDER BY bt.created_at DESC LIMIT 1),
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
      AND (
        lower(trim(bt.subject)) = v_key
        OR (v_key = 'math' AND lower(trim(bt.subject)) IN ('math', '數學'))
      )
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

-- Remove duplicate (session_id, question_order) rows if any, so unique index can be created
DELETE FROM session_answers sa
WHERE sa.question_order IS NOT NULL
  AND sa.id IN (
    SELECT id FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY session_id, question_order
          ORDER BY created_at NULLS LAST, id
        ) AS rn
      FROM session_answers
      WHERE question_order IS NOT NULL
    ) d WHERE d.rn > 1
  );

-- Idempotent: prevent double-charge if the same question_order is submitted twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_answers_session_question_order
  ON session_answers (session_id, question_order)
  WHERE question_order IS NOT NULL;

-- ---------- get_balance_transactions: Math + legacy 數學 ----------
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
  v_key TEXT;
BEGIN
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month')::DATE;
  v_key := lower(trim(p_subject));

  SELECT COALESCE(
    (SELECT balance_after FROM balance_transactions
     WHERE student_id = p_student_id
       AND (
         lower(trim(subject)) = v_key
         OR (v_key = 'math' AND lower(trim(subject)) IN ('math', '數學'))
       )
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
      AND (
        lower(trim(subject)) = v_key
        OR (v_key = 'math' AND lower(trim(subject)) IN ('math', '數學'))
      )
      AND created_at >= v_start
      AND created_at < v_end
  ) t;

  SELECT COALESCE(SUM(sb.remaining_questions), 0) INTO v_current_balance
  FROM student_balances sb
  JOIN students st ON st.id = sb.student_id
  JOIN students me ON me.id = p_student_id AND st.parent_id = me.parent_id
  WHERE (
      lower(trim(sb.subject)) = v_key
      OR (v_key = 'math' AND lower(trim(sb.subject)) IN ('math', '數學'))
    );

  RETURN json_build_object(
    'opening_balance', v_opening_balance,
    'current_balance', v_current_balance,
    'transactions', v_transactions
  );
END;
$$;

-- ---------- submit_answer: insert row + deduct 1 + log tx ----------
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
DECLARE
  v_student_id UUID;
  v_parent_id UUID;
  v_session_subject TEXT;
  v_key TEXT;
  v_target RECORD;
  v_total_after INTEGER;
BEGIN
  SELECT qs.student_id, trim(qs.subject)
  INTO v_student_id, v_session_subject
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION '找不到練習紀錄';
  END IF;

  SELECT s.parent_id INTO v_parent_id FROM students s WHERE s.id = v_student_id;
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION '找不到學生';
  END IF;

  v_key := lower(trim(v_session_subject));

  -- Prefer deducting from the practicing student's row first
  SELECT sb.id, sb.student_id, sb.remaining_questions, trim(sb.subject) AS subj
  INTO v_target
  FROM student_balances sb
  WHERE sb.student_id = v_student_id
    AND (
      lower(trim(sb.subject)) = v_key
      OR (v_key = 'math' AND lower(trim(sb.subject)) IN ('math', '數學'))
    )
    AND sb.remaining_questions > 0
  ORDER BY sb.remaining_questions DESC
  LIMIT 1;

  IF v_target.id IS NULL THEN
    SELECT sb.id, sb.student_id, sb.remaining_questions, trim(sb.subject) AS subj
    INTO v_target
    FROM student_balances sb
    JOIN students st ON st.id = sb.student_id
    WHERE st.parent_id = v_parent_id
      AND (
        lower(trim(sb.subject)) = v_key
        OR (v_key = 'math' AND lower(trim(sb.subject)) IN ('math', '數學'))
      )
      AND sb.remaining_questions > 0
    ORDER BY sb.remaining_questions DESC, sb.id
    LIMIT 1;
  END IF;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION '餘額不足，無法提交此題';
  END IF;

  INSERT INTO session_answers (session_id, question_id, student_answer, is_correct, question_order)
  VALUES (p_session_id, p_question_id, p_student_answer, p_is_correct, p_question_order);

  UPDATE student_balances
  SET remaining_questions = remaining_questions - 1
  WHERE id = v_target.id;

  SELECT COALESCE(SUM(sb.remaining_questions), 0)
  INTO v_total_after
  FROM student_balances sb
  JOIN students st ON st.id = sb.student_id
  WHERE st.parent_id = v_parent_id
    AND (
      lower(trim(sb.subject)) = v_key
      OR (v_key = 'math' AND lower(trim(sb.subject)) IN ('math', '數學'))
    );

  INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description, session_id)
  VALUES (
    v_student_id,
    CASE WHEN v_key = 'math' THEN 'Math' ELSE trim(v_session_subject) END,
    -1,
    v_total_after,
    '練習作答扣除',
    p_session_id
  );
END;
$$;

-- ---------- register_student: one initial balance pool per parent+subject ----------
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
  v_has_balance BOOLEAN;
  v_subject TEXT := 'Math';
BEGIN
  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = p_mobile_number;
  IF v_parent_id IS NULL THEN
    INSERT INTO parents (mobile_number, email) VALUES (p_mobile_number, p_email) RETURNING id INTO v_parent_id;
  ELSE
    IF p_email IS NOT NULL AND p_email <> '' THEN
      UPDATE parents SET email = p_email WHERE id = v_parent_id AND (email IS NULL OR email = '');
    END IF;
  END IF;

  INSERT INTO students (parent_id, student_name, pin_code, avatar_style, grade_level, school_id)
  VALUES (v_parent_id, p_student_name, p_pin_code, p_avatar_style, p_grade_level, p_school_id)
  RETURNING * INTO v_student;

  SELECT EXISTS (
    SELECT 1 FROM student_balances sb
    JOIN students st ON st.id = sb.student_id
    WHERE st.parent_id = v_parent_id
      AND lower(trim(sb.subject)) IN ('math', '數學')
  ) INTO v_has_balance;

  IF NOT v_has_balance THEN
    INSERT INTO student_balances (student_id, subject, remaining_questions)
    VALUES (v_student.id, v_subject, 300);

    INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description)
    VALUES (v_student.id, v_subject, 300, 300, '新用戶註冊贈送');
  END IF;

  RETURN row_to_json(v_student);
END;
$$;

-- ---------- deduct_student_balance: optional batch (e.g. admin); log family total ----------
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
  v_parent_id UUID;
  v_key TEXT;
  v_new_row INTEGER;
  v_total_after INTEGER;
  v_log_student UUID;
BEGIN
  SELECT sb.*, s.parent_id
  INTO v_record
  FROM student_balances sb
  JOIN students s ON s.id = sb.student_id
  WHERE sb.id = p_balance_id;

  IF v_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_parent_id := v_record.parent_id;
  v_key := lower(trim(v_record.subject));
  IF v_key = '數學' THEN v_key := 'math'; END IF;

  v_new_row := GREATEST(0, v_record.remaining_questions - p_amount);

  UPDATE student_balances
  SET remaining_questions = v_new_row
  WHERE id = p_balance_id;

  SELECT COALESCE(SUM(sb.remaining_questions), 0)
  INTO v_total_after
  FROM student_balances sb
  JOIN students st ON st.id = sb.student_id
  WHERE st.parent_id = v_parent_id
    AND (
      lower(trim(sb.subject)) = v_key
      OR (v_key = 'math' AND lower(trim(sb.subject)) IN ('math', '數學'))
    );

  v_log_student := v_record.student_id;

  INSERT INTO balance_transactions (student_id, subject, change_amount, balance_after, description, session_id)
  VALUES (
    v_log_student,
    CASE WHEN v_key = 'math' THEN 'Math' ELSE trim(v_record.subject) END,
    -p_amount,
    v_total_after,
    '完成練習扣除',
    p_session_id
  );

  RETURN json_build_object('remaining_questions', v_total_after);
END;
$$;
