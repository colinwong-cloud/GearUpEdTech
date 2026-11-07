-- ============================================================
-- Admin 配額維護 v2 — effective_cap (admin_cap + tier) Option B
-- HOLD — apply only after Colin yes in SQL Editor
-- shared-db preview=prod — run AFTER supabase_guoyu_admin_quota.sql baseline fns exist
-- Effect: admin_cap on usage rows; admin + product remaining/cap use effective_cap
-- Requires: supabase_guoyu_ocr_quota.sql, supabase_guoyu_tts_quota.sql, supabase_guoyu_admin_quota.sql
-- ============================================================

ALTER TABLE public.parent_guoyu_ocr_usage
  ADD COLUMN IF NOT EXISTS admin_cap INTEGER NULL
  CHECK (admin_cap IS NULL OR (admin_cap >= 1 AND admin_cap <= 10));

ALTER TABLE public.parent_guoyu_tts_usage
  ADD COLUMN IF NOT EXISTS admin_cap INTEGER NULL
  CHECK (admin_cap IS NULL OR (admin_cap >= 1 AND admin_cap <= 10));

CREATE OR REPLACE FUNCTION public.guoyu_effective_cap(p_tier_cap INTEGER, p_admin_cap INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT LEAST(
    10,
    GREATEST(
      GREATEST(COALESCE(p_tier_cap, 1), 1),
      COALESCE(p_admin_cap, GREATEST(COALESCE(p_tier_cap, 1), 1))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.guoyu_remaining_from_effective(p_effective_cap INTEGER, p_usage INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    GREATEST(COALESCE(p_effective_cap, 0), 0) - GREATEST(COALESCE(p_usage, 0), 0)
  );
$$;

-- Shared adjust body: returns (new_usage, new_admin_cap, effective_cap, remaining_after)
CREATE OR REPLACE FUNCTION public.guoyu_admin_quota_apply_remaining_target(
  p_tier_cap INTEGER,
  p_usage INTEGER,
  p_admin_cap INTEGER,
  p_target_remaining INTEGER
)
RETURNS TABLE (
  new_usage INTEGER,
  new_admin_cap INTEGER,
  effective_cap INTEGER,
  remaining_after INTEGER
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_tier INTEGER;
  v_usage INTEGER;
  v_target INTEGER;
  v_desired_effective INTEGER;
  v_new_usage INTEGER;
  v_new_admin INTEGER;
  v_eff INTEGER;
  v_rem INTEGER;
BEGIN
  v_tier := GREATEST(COALESCE(p_tier_cap, 1), 1);
  v_usage := GREATEST(COALESCE(p_usage, 0), 0);
  v_target := GREATEST(LEAST(COALESCE(p_target_remaining, 0), 10), 0);

  v_new_usage := v_usage;
  v_desired_effective := LEAST(10, GREATEST(v_tier, v_usage + v_target));

  IF v_desired_effective > v_tier THEN
    v_new_admin := v_desired_effective;
  ELSIF v_target <= GREATEST(0, v_tier - v_usage) THEN
    v_new_admin := NULL;
    v_desired_effective := GREATEST(v_tier, v_usage + v_target);
  ELSE
    v_new_admin := NULL;
    v_desired_effective := GREATEST(v_tier, v_usage + v_target);
    v_new_usage := GREATEST(0, v_desired_effective - v_target);
  END IF;

  v_eff := guoyu_effective_cap(v_tier, v_new_admin);
  v_rem := guoyu_remaining_from_effective(v_eff, v_new_usage);

  IF v_rem <> v_target THEN
    v_new_usage := GREATEST(0, v_eff - v_target);
    v_rem := guoyu_remaining_from_effective(v_eff, v_new_usage);
  END IF;

  IF v_eff <= v_tier THEN
    v_new_admin := NULL;
    v_eff := guoyu_effective_cap(v_tier, NULL);
    v_rem := guoyu_remaining_from_effective(v_eff, v_new_usage);
  END IF;

  new_usage := v_new_usage;
  new_admin_cap := v_new_admin;
  effective_cap := v_eff;
  remaining_after := v_rem;
  RETURN NEXT;
END;
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
  FROM public.parent_guoyu_ocr_usage u
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

  INSERT INTO public.parent_guoyu_ocr_usage (parent_id, hkt_month, usage_count)
  VALUES (v_parent_id, v_month, 0)
  ON CONFLICT (parent_id, hkt_month) DO NOTHING;

  SELECT usage_count, admin_cap
  INTO v_usage, v_admin_cap
  FROM public.parent_guoyu_ocr_usage
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

  UPDATE public.parent_guoyu_ocr_usage
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
  FROM public.parent_guoyu_tts_usage u
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

  INSERT INTO public.parent_guoyu_tts_usage (parent_id, hkt_month, usage_count)
  VALUES (v_parent_id, v_month, 0)
  ON CONFLICT (parent_id, hkt_month) DO NOTHING;

  SELECT usage_count, admin_cap
  INTO v_usage, v_admin_cap
  FROM public.parent_guoyu_tts_usage
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

  UPDATE public.parent_guoyu_tts_usage
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

-- Product path: get/consume use effective_cap from tier + row.admin_cap
CREATE OR REPLACE FUNCTION public.get_parent_guoyu_ocr_quota(p_parent_id UUID)
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
  FROM parent_guoyu_ocr_usage u
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

CREATE OR REPLACE FUNCTION public.consume_parent_guoyu_ocr_quota(p_parent_id UUID)
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

  INSERT INTO parent_guoyu_ocr_usage (parent_id, hkt_month, usage_count)
  VALUES (p_parent_id, v_month, 0)
  ON CONFLICT (parent_id, hkt_month) DO NOTHING;

  SELECT usage_count, admin_cap
  INTO v_usage, v_admin_cap
  FROM parent_guoyu_ocr_usage
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

  UPDATE parent_guoyu_ocr_usage
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

CREATE OR REPLACE FUNCTION public.get_parent_guoyu_tts_quota(p_parent_id UUID)
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
  FROM parent_guoyu_tts_usage u
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

CREATE OR REPLACE FUNCTION public.consume_parent_guoyu_tts_quota(p_parent_id UUID)
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

  INSERT INTO parent_guoyu_tts_usage (parent_id, hkt_month, usage_count)
  VALUES (p_parent_id, v_month, 0)
  ON CONFLICT (parent_id, hkt_month) DO NOTHING;

  SELECT usage_count, admin_cap
  INTO v_usage, v_admin_cap
  FROM parent_guoyu_tts_usage
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

  UPDATE parent_guoyu_tts_usage
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

REVOKE ALL ON FUNCTION public.guoyu_effective_cap(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guoyu_remaining_from_effective(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guoyu_admin_quota_apply_remaining_target(INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_parent_guoyu_ocr_quota(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_adjust_parent_guoyu_ocr_quota(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_parent_guoyu_tts_quota(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_adjust_parent_guoyu_tts_quota(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_parent_guoyu_ocr_quota(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_parent_guoyu_ocr_quota(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_parent_guoyu_tts_quota(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_parent_guoyu_tts_quota(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.guoyu_effective_cap(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.guoyu_remaining_from_effective(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.guoyu_admin_quota_apply_remaining_target(INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_parent_guoyu_ocr_quota(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_adjust_parent_guoyu_ocr_quota(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_parent_guoyu_tts_quota(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_adjust_parent_guoyu_tts_quota(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_guoyu_ocr_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_parent_guoyu_ocr_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_parent_guoyu_tts_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_parent_guoyu_tts_quota(UUID) TO service_role;
