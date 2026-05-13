-- Fix: paid-tier practices were not recorded in balance transaction history.
-- Result: parent "題目餘額" transaction list showed no new rows for paid users.
--
-- This patch keeps free-tier quota logic unchanged, and adds paid-tier usage logs
-- (description = 'PAID_TIER_USAGE', balance_after = NULL) for audit/history display.

CREATE OR REPLACE FUNCTION public.submit_answer(
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
  v_tier JSON;
  v_is_paid BOOLEAN := false;
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
  v_used INTEGER := 0;
  v_remaining_after INTEGER := 0;
BEGIN
  SELECT qs.student_id, trim(qs.subject)
  INTO v_student_id, v_session_subject
  FROM public.quiz_sessions qs
  WHERE qs.id = p_session_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION '找不到練習紀錄';
  END IF;

  SELECT s.parent_id
  INTO v_parent_id
  FROM public.students s
  WHERE s.id = v_student_id;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION '找不到學生';
  END IF;

  SELECT public.get_parent_tier_status(p.mobile_number)
  INTO v_tier
  FROM public.parents p
  WHERE p.id = v_parent_id;

  v_is_paid := coalesce((v_tier->>'is_paid')::BOOLEAN, false);

  IF NOT v_is_paid THEN
    v_month_start := (date_trunc('month', timezone('Asia/Hong_Kong', now())) AT TIME ZONE 'Asia/Hong_Kong');
    v_month_end := ((date_trunc('month', timezone('Asia/Hong_Kong', now())) + interval '1 month') AT TIME ZONE 'Asia/Hong_Kong');

    SELECT COALESCE(SUM(-bt.change_amount), 0)::INT
    INTO v_used
    FROM public.balance_transactions bt
    JOIN public.students st ON st.id = bt.student_id
    WHERE st.parent_id = v_parent_id
      AND bt.change_amount < 0
      AND bt.created_at >= v_month_start
      AND bt.created_at < v_month_end
      AND bt.description IN ('FREE_TIER_USAGE', '練習作答扣除');

    IF v_used >= 200 THEN
      RAISE EXCEPTION '本月免費題目額度已用完（200題）';
    END IF;
  END IF;

  INSERT INTO public.session_answers (
    session_id,
    question_id,
    student_answer,
    is_correct,
    question_order
  )
  VALUES (
    p_session_id,
    p_question_id,
    p_student_answer,
    p_is_correct,
    p_question_order
  );

  IF NOT v_is_paid THEN
    v_remaining_after := GREATEST(200 - (v_used + 1), 0);
    INSERT INTO public.balance_transactions (
      student_id,
      subject,
      change_amount,
      balance_after,
      description,
      session_id
    )
    VALUES (
      v_student_id,
      CASE WHEN lower(trim(v_session_subject)) = 'math' THEN 'Math' ELSE trim(v_session_subject) END,
      -1,
      v_remaining_after,
      'FREE_TIER_USAGE',
      p_session_id
    );
  ELSE
    INSERT INTO public.balance_transactions (
      student_id,
      subject,
      change_amount,
      balance_after,
      description,
      session_id
    )
    VALUES (
      v_student_id,
      CASE WHEN lower(trim(v_session_subject)) = 'math' THEN 'Math' ELSE trim(v_session_subject) END,
      -1,
      NULL,
      'PAID_TIER_USAGE',
      p_session_id
    );
  END IF;
END;
$$;

-- Optional one-time backfill:
-- Add history rows for paid-tier sessions that already happened after paid start,
-- but were previously missing from balance_transactions.
INSERT INTO public.balance_transactions (
  student_id,
  subject,
  change_amount,
  balance_after,
  description,
  session_id,
  created_at
)
SELECT
  qs.student_id,
  CASE WHEN lower(trim(qs.subject)) = 'math' THEN 'Math' ELSE trim(qs.subject) END AS subject,
  -GREATEST(COALESCE(qs.questions_attempted, 0), 0) AS change_amount,
  NULL AS balance_after,
  'PAID_TIER_USAGE' AS description,
  qs.id AS session_id,
  qs.created_at
FROM public.quiz_sessions qs
JOIN public.students s ON s.id = qs.student_id
JOIN public.parents p ON p.id = s.parent_id
WHERE COALESCE(qs.questions_attempted, 0) > 0
  AND p.paid_started_at IS NOT NULL
  AND qs.created_at >= p.paid_started_at
  AND NOT EXISTS (
    SELECT 1
    FROM public.balance_transactions bt
    WHERE bt.session_id = qs.id
      AND bt.change_amount < 0
  );
