-- ============================================================
-- 中文寫作 offline practice quota — per parent, HKT calendar month (Soft #254)
-- HOLD: shared preview=prod — apply only after Colin yes in SQL Editor
-- Requires: supabase_guoyu_ocr_quota.sql (guoyu_ocr_hkt_month_key, guoyu_ocr_cap_for_parent, guoyu_ocr_parent_is_tutor)
-- Optional v2 helpers: guoyu_effective_cap, guoyu_remaining_from_effective, guoyu_admin_quota_apply_remaining_target
-- Effect: cap 10 if live parent paid_until else 1; tutors always cap 1 (same Finance lock as OCR/TTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.parent_zhongwen_xiezuo_usage (
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  hkt_month TEXT NOT NULL CHECK (hkt_month ~ '^\d{4}-\d{2}$'),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  admin_cap INTEGER NULL CHECK (admin_cap IS NULL OR (admin_cap >= 1 AND admin_cap <= 10)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, hkt_month)
);

CREATE INDEX IF NOT EXISTS idx_parent_zhongwen_xiezuo_usage_month
  ON public.parent_zhongwen_xiezuo_usage (hkt_month);

ALTER TABLE public.parent_zhongwen_xiezuo_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_parent_zhongwen_xiezuo_quota(p_parent_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month TEXT;
  v_tier_cap INTEGER;
  v_admin_cap INTEGER;
  v_cap INTEGER;
  v_usage INTEGER;
  v_remaining INTEGER;
  v_is_tutor BOOLEAN;
  v_is_paid_parent BOOLEAN;
BEGIN
  IF p_parent_id IS NULL THEN
    RETURN json_build_object('error', 'missing_parent');
  END IF;

  v_month := guoyu_ocr_hkt_month_key();
  v_tier_cap := guoyu_ocr_cap_for_parent(p_parent_id);
  v_is_tutor := guoyu_ocr_parent_is_tutor(p_parent_id);
  v_is_paid_parent := (v_tier_cap = 10);

  SELECT u.usage_count, u.admin_cap
  INTO v_usage, v_admin_cap
  FROM parent_zhongwen_xiezuo_usage u
  WHERE u.parent_id = p_parent_id AND u.hkt_month = v_month;

  IF NOT FOUND THEN
    v_usage := 0;
    v_admin_cap := NULL;
  END IF;

  v_cap := guoyu_effective_cap(v_tier_cap, v_admin_cap);
  v_remaining := guoyu_remaining_from_effective(v_cap, v_usage);

  RETURN json_build_object(
    'hkt_month', v_month,
    'cap', v_cap,
    'tier_cap', v_tier_cap,
    'usage_count', v_usage,
    'remaining', v_remaining,
    'is_paid_parent', v_is_paid_parent,
    'is_tutor_parent', v_is_tutor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_parent_zhongwen_xiezuo_quota(p_parent_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month TEXT;
  v_tier_cap INTEGER;
  v_admin_cap INTEGER;
  v_cap INTEGER;
  v_usage INTEGER;
  v_remaining INTEGER;
BEGIN
  IF p_parent_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'missing_parent');
  END IF;

  v_month := guoyu_ocr_hkt_month_key();
  v_tier_cap := guoyu_ocr_cap_for_parent(p_parent_id);

  INSERT INTO parent_zhongwen_xiezuo_usage (parent_id, hkt_month, usage_count)
  VALUES (p_parent_id, v_month, 0)
  ON CONFLICT (parent_id, hkt_month) DO NOTHING;

  SELECT usage_count, admin_cap
  INTO v_usage, v_admin_cap
  FROM parent_zhongwen_xiezuo_usage
  WHERE parent_id = p_parent_id AND hkt_month = v_month
  FOR UPDATE;

  v_cap := guoyu_effective_cap(v_tier_cap, v_admin_cap);

  IF v_usage >= v_cap THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'quota_exhausted',
      'cap', v_cap,
      'tier_cap', v_tier_cap,
      'remaining', 0,
      'usage_count', v_usage,
      'hkt_month', v_month,
      'is_paid_parent', (v_tier_cap = 10),
      'is_tutor_parent', guoyu_ocr_parent_is_tutor(p_parent_id)
    );
  END IF;

  UPDATE parent_zhongwen_xiezuo_usage
  SET usage_count = usage_count + 1, updated_at = now()
  WHERE parent_id = p_parent_id AND hkt_month = v_month
  RETURNING usage_count INTO v_usage;

  v_remaining := guoyu_remaining_from_effective(v_cap, v_usage);

  RETURN json_build_object(
    'ok', true,
    'cap', v_cap,
    'tier_cap', v_tier_cap,
    'remaining', v_remaining,
    'usage_count', v_usage,
    'hkt_month', v_month,
    'is_paid_parent', (v_tier_cap = 10),
    'is_tutor_parent', guoyu_ocr_parent_is_tutor(p_parent_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_parent_zhongwen_xiezuo_quota(p_mobile TEXT)
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
  v_tier_cap INTEGER;
  v_effective_cap INTEGER;
  v_admin_cap INTEGER;
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
  v_tier_cap := guoyu_ocr_cap_for_parent(v_parent_id);
  v_is_tutor := guoyu_ocr_parent_is_tutor(v_parent_id);
  v_is_paid := (v_tier_cap = 10);

  SELECT u.usage_count, u.admin_cap, true
  INTO v_usage, v_admin_cap, v_has_row
  FROM public.parent_zhongwen_xiezuo_usage u
  WHERE u.parent_id = v_parent_id AND u.hkt_month = v_month;

  IF NOT FOUND THEN
    v_usage := 0;
    v_admin_cap := NULL;
    v_has_row := false;
  END IF;

  v_effective_cap := guoyu_effective_cap(v_tier_cap, v_admin_cap);
  v_remaining := guoyu_remaining_from_effective(v_effective_cap, v_usage);

  RETURN json_build_object(
    'found', true,
    'parent_id', v_parent_id,
    'mobile_number', v_mobile,
    'parent_name', v_parent_name,
    'hkt_month', v_month,
    'cap', v_effective_cap,
    'tier_cap', v_tier_cap,
    'admin_cap', v_admin_cap,
    'usage_count', v_usage,
    'remaining', v_remaining,
    'is_paid_parent', v_is_paid,
    'is_tutor_parent', v_is_tutor,
    'has_usage_row', v_has_row
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_parent_zhongwen_xiezuo_quota(
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
  v_tier_cap INTEGER;
  v_usage INTEGER;
  v_admin_cap INTEGER;
  v_effective INTEGER;
  v_before INTEGER;
  v_after INTEGER;
  v_dir TEXT;
  v_apply RECORD;
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
  v_tier_cap := guoyu_ocr_cap_for_parent(v_parent_id);

  INSERT INTO public.parent_zhongwen_xiezuo_usage (parent_id, hkt_month, usage_count)
  VALUES (v_parent_id, v_month, 0)
  ON CONFLICT (parent_id, hkt_month) DO NOTHING;

  SELECT usage_count, admin_cap
  INTO v_usage, v_admin_cap
  FROM public.parent_zhongwen_xiezuo_usage
  WHERE parent_id = v_parent_id AND hkt_month = v_month
  FOR UPDATE;

  v_effective := guoyu_effective_cap(v_tier_cap, v_admin_cap);
  v_before := guoyu_remaining_from_effective(v_effective, v_usage);

  IF v_dir = 'increase' THEN
    v_after := LEAST(10, v_before + p_amount);
  ELSE
    v_after := GREATEST(0, v_before - p_amount);
  END IF;

  IF v_after < 0 OR v_after > 10 THEN
    RETURN json_build_object('ok', false, 'error', 'clamp_reject', 'remaining_before', v_before);
  END IF;

  SELECT * INTO v_apply
  FROM guoyu_admin_quota_apply_remaining_target(v_tier_cap, v_usage, v_admin_cap, v_after);

  UPDATE public.parent_zhongwen_xiezuo_usage
  SET
    usage_count = v_apply.new_usage,
    admin_cap = v_apply.new_admin_cap,
    updated_at = now()
  WHERE parent_id = v_parent_id AND hkt_month = v_month;

  RETURN json_build_object(
    'ok', true,
    'mobile_number', v_mobile,
    'hkt_month', v_month,
    'remaining_before', v_before,
    'remaining_after', v_apply.remaining_after,
    'usage_count', v_apply.new_usage,
    'admin_cap', v_apply.new_admin_cap,
    'effective_cap', v_apply.effective_cap,
    'tier_cap', v_tier_cap,
    'amount', p_amount,
    'direction', v_dir
  );
END;
$$;

REVOKE ALL ON TABLE public.parent_zhongwen_xiezuo_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.parent_zhongwen_xiezuo_usage TO service_role;

REVOKE ALL ON FUNCTION public.get_parent_zhongwen_xiezuo_quota(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_parent_zhongwen_xiezuo_quota(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_parent_zhongwen_xiezuo_quota(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_adjust_parent_zhongwen_xiezuo_quota(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_parent_zhongwen_xiezuo_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_parent_zhongwen_xiezuo_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_parent_zhongwen_xiezuo_quota(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_adjust_parent_zhongwen_xiezuo_quota(TEXT, TEXT, INTEGER) TO service_role;
