-- ============================================================
-- Admin 配額維護 — 國語 OCR / TTS 本月尚餘調整（HKT month）
-- HOLD — apply only after Colin yes in SQL Editor
-- Effect: service_role-only RPCs; admin may set remaining ∈ [0, 10] (LOCK B)
--         regardless of product tier cap; does not change consume_* or guoyu_ocr_cap_for_parent
-- Requires: supabase_guoyu_ocr_quota.sql (+ TTS usage table from supabase_guoyu_tts_quota.sql)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_guoyu_remaining_from_usage(p_usage INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(0, 10 - GREATEST(COALESCE(p_usage, 0), 0));
$$;

CREATE OR REPLACE FUNCTION public.admin_get_parent_guoyu_ocr_quota(p_mobile TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_parent_name TEXT;
  v_mobile TEXT;
  v_month TEXT;
  v_cap INTEGER;
  v_is_tutor BOOLEAN;
  v_is_paid BOOLEAN;
  v_usage INTEGER;
  v_has_row BOOLEAN;
  v_remaining INTEGER;
BEGIN
  SELECT id, parent_name, mobile_number
  INTO v_parent_id, v_parent_name, v_mobile
  FROM public.parents
  WHERE mobile_number = trim(p_mobile)
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    RETURN json_build_object('found', false);
  END IF;

  v_month := guoyu_ocr_hkt_month_key();
  v_cap := guoyu_ocr_cap_for_parent(v_parent_id);
  v_is_tutor := guoyu_ocr_parent_is_tutor(v_parent_id);
  v_is_paid := (v_cap = 10);

  SELECT u.usage_count, true
  INTO v_usage, v_has_row
  FROM public.parent_guoyu_ocr_usage u
  WHERE u.parent_id = v_parent_id AND u.hkt_month = v_month;

  IF NOT FOUND THEN
    v_usage := 0;
    v_has_row := false;
  END IF;

  v_remaining := admin_guoyu_remaining_from_usage(v_usage);

  RETURN json_build_object(
    'found', true,
    'parent_id', v_parent_id,
    'mobile_number', v_mobile,
    'parent_name', v_parent_name,
    'hkt_month', v_month,
    'cap', v_cap,
    'usage_count', v_usage,
    'remaining', v_remaining,
    'is_paid_parent', v_is_paid,
    'is_tutor_parent', v_is_tutor,
    'has_usage_row', v_has_row
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_parent_guoyu_ocr_quota(
  p_mobile TEXT,
  p_direction TEXT,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_mobile TEXT;
  v_month TEXT;
  v_usage INTEGER;
  v_before INTEGER;
  v_after INTEGER;
  v_new_usage INTEGER;
  v_dir TEXT;
BEGIN
  v_dir := lower(trim(coalesce(p_direction, '')));
  IF v_dir NOT IN ('increase', 'decrease') THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_direction');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT id, mobile_number INTO v_parent_id, v_mobile
  FROM public.parents
  WHERE mobile_number = trim(p_mobile)
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'parent_not_found');
  END IF;

  v_month := guoyu_ocr_hkt_month_key();

  INSERT INTO public.parent_guoyu_ocr_usage (parent_id, hkt_month, usage_count)
  VALUES (v_parent_id, v_month, 0)
  ON CONFLICT (parent_id, hkt_month) DO NOTHING;

  SELECT usage_count INTO v_usage
  FROM public.parent_guoyu_ocr_usage
  WHERE parent_id = v_parent_id AND hkt_month = v_month
  FOR UPDATE;

  v_before := admin_guoyu_remaining_from_usage(v_usage);

  IF v_dir = 'increase' THEN
    v_after := LEAST(10, v_before + p_amount);
  ELSE
    v_after := GREATEST(0, v_before - p_amount);
  END IF;

  IF v_after < 0 OR v_after > 10 THEN
    RETURN json_build_object('ok', false, 'error', 'clamp_reject', 'remaining_before', v_before);
  END IF;

  v_new_usage := GREATEST(0, 10 - v_after);

  UPDATE public.parent_guoyu_ocr_usage
  SET usage_count = v_new_usage, updated_at = now()
  WHERE parent_id = v_parent_id AND hkt_month = v_month;

  RETURN json_build_object(
    'ok', true,
    'mobile_number', v_mobile,
    'hkt_month', v_month,
    'remaining_before', v_before,
    'remaining_after', v_after,
    'usage_count', v_new_usage,
    'amount', p_amount,
    'direction', v_dir
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_parent_guoyu_tts_quota(p_mobile TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_parent_name TEXT;
  v_mobile TEXT;
  v_month TEXT;
  v_cap INTEGER;
  v_is_tutor BOOLEAN;
  v_is_paid BOOLEAN;
  v_usage INTEGER;
  v_has_row BOOLEAN;
  v_remaining INTEGER;
BEGIN
  SELECT id, parent_name, mobile_number
  INTO v_parent_id, v_parent_name, v_mobile
  FROM public.parents
  WHERE mobile_number = trim(p_mobile)
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    RETURN json_build_object('found', false);
  END IF;

  v_month := guoyu_ocr_hkt_month_key();
  v_cap := guoyu_ocr_cap_for_parent(v_parent_id);
  v_is_tutor := guoyu_ocr_parent_is_tutor(v_parent_id);
  v_is_paid := (v_cap = 10);

  SELECT u.usage_count, true
  INTO v_usage, v_has_row
  FROM public.parent_guoyu_tts_usage u
  WHERE u.parent_id = v_parent_id AND u.hkt_month = v_month;

  IF NOT FOUND THEN
    v_usage := 0;
    v_has_row := false;
  END IF;

  v_remaining := admin_guoyu_remaining_from_usage(v_usage);

  RETURN json_build_object(
    'found', true,
    'parent_id', v_parent_id,
    'mobile_number', v_mobile,
    'parent_name', v_parent_name,
    'hkt_month', v_month,
    'cap', v_cap,
    'usage_count', v_usage,
    'remaining', v_remaining,
    'is_paid_parent', v_is_paid,
    'is_tutor_parent', v_is_tutor,
    'has_usage_row', v_has_row
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_parent_guoyu_tts_quota(
  p_mobile TEXT,
  p_direction TEXT,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_mobile TEXT;
  v_month TEXT;
  v_usage INTEGER;
  v_before INTEGER;
  v_after INTEGER;
  v_new_usage INTEGER;
  v_dir TEXT;
BEGIN
  v_dir := lower(trim(coalesce(p_direction, '')));
  IF v_dir NOT IN ('increase', 'decrease') THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_direction');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT id, mobile_number INTO v_parent_id, v_mobile
  FROM public.parents
  WHERE mobile_number = trim(p_mobile)
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'parent_not_found');
  END IF;

  v_month := guoyu_ocr_hkt_month_key();

  INSERT INTO public.parent_guoyu_tts_usage (parent_id, hkt_month, usage_count)
  VALUES (v_parent_id, v_month, 0)
  ON CONFLICT (parent_id, hkt_month) DO NOTHING;

  SELECT usage_count INTO v_usage
  FROM public.parent_guoyu_tts_usage
  WHERE parent_id = v_parent_id AND hkt_month = v_month
  FOR UPDATE;

  v_before := admin_guoyu_remaining_from_usage(v_usage);

  IF v_dir = 'increase' THEN
    v_after := LEAST(10, v_before + p_amount);
  ELSE
    v_after := GREATEST(0, v_before - p_amount);
  END IF;

  IF v_after < 0 OR v_after > 10 THEN
    RETURN json_build_object('ok', false, 'error', 'clamp_reject', 'remaining_before', v_before);
  END IF;

  v_new_usage := GREATEST(0, 10 - v_after);

  UPDATE public.parent_guoyu_tts_usage
  SET usage_count = v_new_usage, updated_at = now()
  WHERE parent_id = v_parent_id AND hkt_month = v_month;

  RETURN json_build_object(
    'ok', true,
    'mobile_number', v_mobile,
    'hkt_month', v_month,
    'remaining_before', v_before,
    'remaining_after', v_after,
    'usage_count', v_new_usage,
    'amount', p_amount,
    'direction', v_dir
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_guoyu_remaining_from_usage(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_parent_guoyu_ocr_quota(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_adjust_parent_guoyu_ocr_quota(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_parent_guoyu_tts_quota(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_adjust_parent_guoyu_tts_quota(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_guoyu_remaining_from_usage(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_parent_guoyu_ocr_quota(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_adjust_parent_guoyu_ocr_quota(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_parent_guoyu_tts_quota(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_adjust_parent_guoyu_tts_quota(TEXT, TEXT, INTEGER) TO service_role;
