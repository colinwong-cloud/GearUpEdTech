-- ============================================================
-- Paid tier + payment foundation
-- Run in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parents'
      AND column_name = 'subscription_tier'
  ) THEN
    ALTER TABLE public.parents
      ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parents'
      AND column_name = 'paid_until'
  ) THEN
    ALTER TABLE public.parents
      ADD COLUMN paid_until TIMESTAMPTZ NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parents'
      AND column_name = 'paid_started_at'
  ) THEN
    ALTER TABLE public.parents
      ADD COLUMN paid_started_at TIMESTAMPTZ NULL;
  END IF;
END $$;

ALTER TABLE public.parents
  ALTER COLUMN subscription_tier SET DEFAULT 'free';

UPDATE public.parents
SET subscription_tier = 'free'
WHERE subscription_tier IS NULL
   OR lower(trim(subscription_tier)) NOT IN ('free', 'paid');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parents_subscription_tier_check'
  ) THEN
    ALTER TABLE public.parents
      ADD CONSTRAINT parents_subscription_tier_check
      CHECK (lower(trim(subscription_tier)) IN ('free', 'paid'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_percent NUMERIC(5, 2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  salesperson TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discount_codes_code_format_check'
  ) THEN
    ALTER TABLE public.discount_codes
      ADD CONSTRAINT discount_codes_code_format_check
      CHECK (code ~ '^[A-Za-z0-9]{6}$');
  END IF;
END $$;

INSERT INTO public.discount_codes (code, discount_percent, salesperson, is_active)
VALUES ('ASD516', 50, 'Colin Wong', true)
ON CONFLICT (code)
DO UPDATE
SET discount_percent = EXCLUDED.discount_percent,
    salesperson = EXCLUDED.salesperson,
    is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS public.parent_payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NULL REFERENCES public.parents(id) ON DELETE SET NULL,
  mobile_number TEXT NOT NULL,
  merchant_order_id TEXT NOT NULL UNIQUE,
  request_id UUID NOT NULL UNIQUE,
  amount_hkd NUMERIC(10, 2) NOT NULL CHECK (amount_hkd > 0),
  discount_code TEXT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  final_amount_hkd NUMERIC(10, 2) NOT NULL CHECK (final_amount_hkd >= 0),
  payment_method TEXT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'cancelled')),
  payment_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_recurring_payment BOOLEAN NOT NULL DEFAULT false,
  airwallex_payment_intent_id TEXT NULL,
  paid_at TIMESTAMPTZ NULL,
  raw_response JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parent_payment_orders'
      AND column_name = 'finalized_at'
  ) THEN
    ALTER TABLE public.parent_payment_orders
      ADD COLUMN finalized_at TIMESTAMPTZ NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parent_payment_orders'
      AND column_name = 'payment_started_at'
  ) THEN
    ALTER TABLE public.parent_payment_orders
      ADD COLUMN payment_started_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parent_payment_orders'
      AND column_name = 'is_recurring_payment'
  ) THEN
    ALTER TABLE public.parent_payment_orders
      ADD COLUMN is_recurring_payment BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parent_payment_orders'
      AND column_name = 'airwallex_payment_attempt_id'
  ) THEN
    ALTER TABLE public.parent_payment_orders
      ADD COLUMN airwallex_payment_attempt_id TEXT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_parent_payment_orders_mobile
  ON public.parent_payment_orders (mobile_number, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_payment_orders_intent_id
  ON public.parent_payment_orders (airwallex_payment_intent_id)
  WHERE airwallex_payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.airwallex_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payment_intent_id TEXT NULL,
  order_id UUID NULL REFERENCES public.parent_payment_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,
  error_message TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_airwallex_webhook_events_intent
  ON public.airwallex_webhook_events (payment_intent_id, received_at DESC);

CREATE OR REPLACE FUNCTION public.validate_discount_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_row RECORD;
BEGIN
  v_code := upper(trim(coalesce(p_code, '')));
  IF v_code = '' THEN
    RETURN json_build_object(
      'valid', false,
      'code', null,
      'discount_percent', 0,
      'salesperson', null
    );
  END IF;

  SELECT dc.*
  INTO v_row
  FROM public.discount_codes dc
  WHERE upper(dc.code) = v_code
    AND dc.is_active = true;

  IF v_row IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'code', v_code,
      'discount_percent', 0,
      'salesperson', null
    );
  END IF;

  RETURN json_build_object(
    'valid', true,
    'code', upper(v_row.code),
    'discount_percent', v_row.discount_percent,
    'salesperson', v_row.salesperson
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_parent_tier_status(p_mobile TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_is_paid BOOLEAN := false;
  v_tier TEXT := 'free';
  v_paid_until TIMESTAMPTZ := NULL;
BEGIN
  SELECT *
  INTO v_parent
  FROM public.parents
  WHERE mobile_number = trim(coalesce(p_mobile, ''));

  IF v_parent IS NULL THEN
    RETURN json_build_object(
      'tier', 'free',
      'is_paid', false,
      'paid_until', null,
      'tier_label', '免費用戶',
      'monthly_free_quota', 200
    );
  END IF;

  v_paid_until := v_parent.paid_until;
  v_is_paid := (v_parent.paid_until IS NOT NULL AND v_parent.paid_until >= now());
  v_tier := CASE WHEN v_is_paid THEN 'paid' ELSE 'free' END;

  IF v_parent.subscription_tier IS DISTINCT FROM v_tier THEN
    UPDATE public.parents
    SET subscription_tier = v_tier
    WHERE id = v_parent.id;
  END IF;

  RETURN json_build_object(
    'tier', v_tier,
    'is_paid', v_is_paid,
    'paid_until', v_paid_until,
    'tier_label', CASE WHEN v_is_paid THEN '月費用戶' ELSE '免費用戶' END,
    'monthly_free_quota', 200
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_parent_paid_month(
  p_mobile TEXT,
  p_reference TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_now TIMESTAMPTZ := now();
  v_new_until TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO v_parent
  FROM public.parents
  WHERE mobile_number = trim(coalesce(p_mobile, ''));

  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Parent not found';
  END IF;

  IF v_parent.paid_until IS NOT NULL AND v_parent.paid_until >= v_now THEN
    v_new_until := (v_parent.paid_until + interval '1 month');
  ELSE
    v_new_until := (v_now + interval '1 month' - interval '1 second');
  END IF;

  UPDATE public.parents
  SET
    subscription_tier = 'paid',
    paid_started_at = CASE
      WHEN paid_until IS NULL OR paid_until < v_now THEN v_now
      ELSE paid_started_at
    END,
    paid_until = v_new_until
  WHERE id = v_parent.id;

  RETURN json_build_object(
    'success', true,
    'mobile_number', v_parent.mobile_number,
    'reference', p_reference,
    'paid_until', v_new_until,
    'tier', 'paid'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_parent_payment(
  p_order_id UUID,
  p_payment_intent_id TEXT,
  p_payment_attempt_id TEXT DEFAULT NULL,
  p_paid BOOLEAN DEFAULT true,
  p_raw_response JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT *
  INTO v_order
  FROM public.parent_payment_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.finalized_at IS NOT NULL THEN
    RETURN json_build_object(
      'ok', true,
      'already_finalized', true,
      'status', v_order.status,
      'mobile_number', v_order.mobile_number
    );
  END IF;

  UPDATE public.parent_payment_orders
  SET
    status = CASE WHEN p_paid THEN 'paid' ELSE 'failed' END,
    paid_at = CASE WHEN p_paid THEN coalesce(v_order.paid_at, v_now) ELSE NULL END,
    finalized_at = v_now,
    airwallex_payment_intent_id = COALESCE(NULLIF(trim(p_payment_intent_id), ''), v_order.airwallex_payment_intent_id),
    airwallex_payment_attempt_id = COALESCE(NULLIF(trim(coalesce(p_payment_attempt_id, '')), ''), v_order.airwallex_payment_attempt_id),
    raw_response = COALESCE(p_raw_response, '{}'::jsonb),
    updated_at = v_now
  WHERE id = v_order.id;

  IF p_paid THEN
    PERFORM public.apply_parent_paid_month(v_order.mobile_number, COALESCE(NULLIF(trim(p_payment_intent_id), ''), v_order.merchant_order_id));
  END IF;

  RETURN json_build_object(
    'ok', true,
    'already_finalized', false,
    'status', CASE WHEN p_paid THEN 'paid' ELSE 'failed' END,
    'mobile_number', v_order.mobile_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.login_by_mobile(
  p_mobile_number TEXT,
  p_pin_code TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_parent RECORD;
  v_students JSON;
  v_tier JSON;
BEGIN
  SELECT id, mobile_number, paid_until, subscription_tier
  INTO v_parent
  FROM public.parents
  WHERE mobile_number = p_mobile_number;

  IF v_parent IS NULL THEN
    RETURN json_build_object(
      'parent_found', false,
      'parent_id', null,
      'students', '[]'::json
    );
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
    )
    INTO v_students
    FROM public.students s
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
    )
    INTO v_students
    FROM public.students s
    WHERE s.parent_id = v_parent.id
      AND s.pin_code = crypt(p_pin_code, s.pin_code);
  END IF;

  SELECT public.get_parent_tier_status(p_mobile_number) INTO v_tier;

  RETURN json_build_object(
    'parent_found', true,
    'parent_id', v_parent.id,
    'students', v_students,
    'tier', coalesce(v_tier->>'tier', 'free'),
    'is_paid', coalesce((v_tier->>'is_paid')::BOOLEAN, false),
    'paid_until', v_tier->>'paid_until',
    'tier_label', coalesce(v_tier->>'tier_label', '免費用戶')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_student(
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
SET search_path = public, extensions
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

  SELECT id
  INTO v_parent_id
  FROM public.parents
  WHERE mobile_number = p_mobile_number;

  IF v_parent_id IS NULL THEN
    INSERT INTO public.parents (mobile_number, email, subscription_tier)
    VALUES (p_mobile_number, p_email, 'free')
    RETURNING id INTO v_parent_id;
  ELSE
    IF p_email IS NOT NULL AND p_email <> '' THEN
      UPDATE public.parents
      SET email = p_email
      WHERE id = v_parent_id
        AND (email IS NULL OR email = '');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.parent_id = v_parent_id
      AND upper(trim(s.grade_level)) = upper(trim(p_grade_level))
  ) THEN
    RAISE EXCEPTION '因系統紀錄已有同年級學生而未能添加，如有查詢，請電郵至 cs@hkedutech.com';
  END IF;

  INSERT INTO public.students (parent_id, student_name, pin_code, avatar_style, grade_level, school_id)
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

CREATE OR REPLACE FUNCTION public.add_student_to_parent(
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
SET search_path = public, extensions
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

  SELECT id
  INTO v_parent_id
  FROM public.parents
  WHERE mobile_number = p_mobile_number;

  IF v_parent_id IS NULL THEN
    RETURN json_build_object('error', 'Parent not found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.parent_id = v_parent_id
      AND upper(trim(s.grade_level)) = upper(trim(p_grade_level))
  ) THEN
    RAISE EXCEPTION '因系統紀錄已有同年級學生而未能添加，如有查詢，請電郵至 cs@hkedutech.com';
  END IF;

  INSERT INTO public.students (parent_id, student_name, pin_code, avatar_style, grade_level, school_id)
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

CREATE OR REPLACE FUNCTION public.get_parent_profile(p_mobile TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_result JSON;
  v_tier JSON;
BEGIN
  SELECT *
  INTO v_parent
  FROM public.parents
  WHERE mobile_number = p_mobile;

  IF v_parent IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT public.get_parent_tier_status(p_mobile) INTO v_tier;

  SELECT json_build_object(
    'parent', json_build_object(
      'id', v_parent.id,
      'mobile_number', v_parent.mobile_number,
      'parent_name', v_parent.parent_name,
      'email', v_parent.email,
      'subscription_tier', coalesce(v_tier->>'tier', 'free'),
      'paid_until', v_tier->>'paid_until',
      'tier_label', coalesce(v_tier->>'tier_label', '免費用戶'),
      'is_paid', coalesce((v_tier->>'is_paid')::BOOLEAN, false)
    ),
    'students', COALESCE((
      SELECT json_agg(
        json_build_object(
          'id', s.id,
          'student_name', s.student_name,
          'avatar_style', s.avatar_style,
          'grade_level', s.grade_level,
          'school_id', s.school_id,
          'gender', s.gender
        )
      )
      FROM public.students s
      WHERE s.parent_id = v_parent.id
    ), '[]'::json)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_balance(
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
  v_tier JSON;
  v_is_paid BOOLEAN := false;
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
  v_used INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  SELECT s.parent_id
  INTO v_parent_id
  FROM public.students s
  WHERE s.id = p_student_id;

  IF v_parent_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT public.get_parent_tier_status(p.mobile_number)
  INTO v_tier
  FROM public.parents p
  WHERE p.id = v_parent_id;

  v_is_paid := coalesce((v_tier->>'is_paid')::BOOLEAN, false);

  IF v_is_paid THEN
    RETURN json_build_object(
      'id', p_student_id,
      'student_id', p_student_id,
      'subject', 'ALL',
      'remaining_questions', 999999
    );
  END IF;

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

  v_remaining := GREATEST(200 - v_used, 0);

  RETURN json_build_object(
    'id', p_student_id,
    'student_id', p_student_id,
    'subject', 'ALL',
    'remaining_questions', v_remaining
  );
END;
$$;

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
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_parent_balance_view(
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
  v_parent RECORD;
  v_student_ids UUID[];
  v_tier JSON;
  v_is_paid BOOLEAN := false;
  v_key TEXT;
  v_start DATE;
  v_end DATE;
  v_used_month INTEGER := 0;
  v_total_balance INTEGER := 0;
  v_opening_balance INTEGER := 0;
  v_transactions JSON;
BEGIN
  SELECT *
  INTO v_parent
  FROM public.parents
  WHERE mobile_number = p_mobile;

  IF v_parent IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(id)
  INTO v_student_ids
  FROM public.students
  WHERE parent_id = v_parent.id;

  IF v_student_ids IS NULL THEN
    RETURN json_build_object(
      'total_balance', 200,
      'opening_balance', 200,
      'transactions', '[]'::json
    );
  END IF;

  SELECT public.get_parent_tier_status(p_mobile) INTO v_tier;
  v_is_paid := coalesce((v_tier->>'is_paid')::BOOLEAN, false);

  v_key := lower(trim(coalesce(p_subject, '')));
  IF v_key = '' THEN
    v_key := 'math';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month')::DATE;

  IF v_is_paid THEN
    SELECT COALESCE(
      (SELECT bt.balance_after
       FROM public.balance_transactions bt
       WHERE bt.student_id = ANY(v_student_ids)
         AND (
           lower(trim(bt.subject)) = v_key
           OR (v_key = 'math' AND lower(trim(bt.subject)) IN ('math', '數學'))
         )
         AND bt.created_at < v_start
       ORDER BY bt.created_at DESC
       LIMIT 1),
      -1
    ) INTO v_opening_balance;

    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at), '[]'::json)
    INTO v_transactions
    FROM (
      SELECT
        bt.id,
        bt.subject,
        bt.change_amount,
        bt.balance_after,
        bt.description,
        bt.session_id,
        bt.created_at,
        s.student_name
      FROM public.balance_transactions bt
      JOIN public.students s ON s.id = bt.student_id
      WHERE bt.student_id = ANY(v_student_ids)
        AND (
          lower(trim(bt.subject)) = v_key
          OR (v_key = 'math' AND lower(trim(bt.subject)) IN ('math', '數學'))
        )
        AND bt.created_at >= v_start
        AND bt.created_at < v_end
    ) t;

    RETURN json_build_object(
      'total_balance', -1,
      'opening_balance', v_opening_balance,
      'transactions', v_transactions
    );
  END IF;

  SELECT COALESCE(SUM(-bt.change_amount), 0)::INT
  INTO v_used_month
  FROM public.balance_transactions bt
  WHERE bt.student_id = ANY(v_student_ids)
    AND bt.change_amount < 0
    AND bt.created_at >= v_start
    AND bt.created_at < v_end
    AND bt.description IN ('FREE_TIER_USAGE', '練習作答扣除');

  v_total_balance := GREATEST(200 - v_used_month, 0);

  SELECT COALESCE(
    (SELECT bt.balance_after
     FROM public.balance_transactions bt
     WHERE bt.student_id = ANY(v_student_ids)
       AND (
         lower(trim(bt.subject)) = v_key
         OR (v_key = 'math' AND lower(trim(bt.subject)) IN ('math', '數學'))
       )
       AND bt.created_at < v_start
     ORDER BY bt.created_at DESC
     LIMIT 1),
    200
  ) INTO v_opening_balance;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at), '[]'::json)
  INTO v_transactions
  FROM (
    SELECT
      bt.id,
      bt.subject,
      bt.change_amount,
      bt.balance_after,
      bt.description,
      bt.session_id,
      bt.created_at,
      s.student_name
    FROM public.balance_transactions bt
    JOIN public.students s ON s.id = bt.student_id
    WHERE bt.student_id = ANY(v_student_ids)
      AND (
        lower(trim(bt.subject)) = v_key
        OR (v_key = 'math' AND lower(trim(bt.subject)) IN ('math', '數學'))
      )
      AND bt.created_at >= v_start
      AND bt.created_at < v_end
      AND bt.description IN ('FREE_TIER_USAGE', '練習作答扣除')
  ) t;

  RETURN json_build_object(
    'total_balance', v_total_balance,
    'opening_balance', v_opening_balance,
    'transactions', v_transactions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_tier_status(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_discount_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.apply_parent_paid_month(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_parent_payment(UUID, TEXT, TEXT, BOOLEAN, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.update_student_profile(
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
SET search_path = public, extensions
AS $$
DECLARE
  v_parent_id UUID;
  v_pin_hash TEXT;
BEGIN
  IF p_pin_code IS NULL OR p_pin_code !~ '^[A-Za-z0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 alphanumeric characters';
  END IF;

  SELECT parent_id
  INTO v_parent_id
  FROM public.students
  WHERE id = p_student_id;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_pin_hash := crypt(p_pin_code, gen_salt('bf'));

  -- Keep shared PIN behavior for all siblings under the same parent.
  UPDATE public.students
  SET pin_code = v_pin_hash
  WHERE parent_id = v_parent_id;

  -- Update profile fields only for the selected student.
  UPDATE public.students
  SET
    student_name = p_student_name,
    avatar_style = p_avatar_style,
    grade_level = p_grade_level,
    school_id = p_school_id,
    gender = NULLIF(UPPER(TRIM(p_gender)), '')
  WHERE id = p_student_id;
END;
$$;
