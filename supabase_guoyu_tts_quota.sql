-- ============================================================
-- 國語練習 TTS (朗讀) quota — per parent, HKT calendar month (Phase 0)
-- HOLD: shared preview DB (hptttwbmwjaroazkosvr) — apply only after Colin yes in SQL Editor
-- Effect: parent_id + HKT month usage; cap 10 if live parent paid_until else 1; tutors always cap 1
-- Requires: guoyu_ocr_hkt_month_key + guoyu_ocr_cap_for_parent from supabase_guoyu_ocr_quota.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.parent_guoyu_tts_usage (
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  hkt_month TEXT NOT NULL CHECK (hkt_month ~ '^\d{4}-\d{2}$'),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, hkt_month)
);

CREATE INDEX IF NOT EXISTS idx_parent_guoyu_tts_usage_month
  ON public.parent_guoyu_tts_usage (hkt_month);

ALTER TABLE public.parent_guoyu_tts_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_parent_guoyu_tts_quota(p_parent_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month TEXT;
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
  v_cap := guoyu_ocr_cap_for_parent(p_parent_id);
  v_is_tutor := guoyu_ocr_parent_is_tutor(p_parent_id);
  v_is_paid_parent := (v_cap = 10);

  SELECT COALESCE(u.usage_count, 0)
  INTO v_usage
  FROM parent_guoyu_tts_usage u
  WHERE u.parent_id = p_parent_id AND u.hkt_month = v_month;

  IF NOT FOUND THEN
    v_usage := 0;
  END IF;

  v_remaining := GREATEST(v_cap - v_usage, 0);

  RETURN json_build_object(
    'hkt_month', v_month,
    'cap', v_cap,
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
  v_cap INTEGER;
  v_usage INTEGER;
  v_remaining INTEGER;
BEGIN
  IF p_parent_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'missing_parent');
  END IF;

  v_month := guoyu_ocr_hkt_month_key();
  v_cap := guoyu_ocr_cap_for_parent(p_parent_id);

  INSERT INTO parent_guoyu_tts_usage (parent_id, hkt_month, usage_count)
  VALUES (p_parent_id, v_month, 0)
  ON CONFLICT (parent_id, hkt_month) DO NOTHING;

  SELECT usage_count INTO v_usage
  FROM parent_guoyu_tts_usage
  WHERE parent_id = p_parent_id AND hkt_month = v_month
  FOR UPDATE;

  IF v_usage >= v_cap THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'quota_exhausted',
      'cap', v_cap,
      'remaining', 0,
      'usage_count', v_usage,
      'hkt_month', v_month,
      'is_paid_parent', (v_cap = 10),
      'is_tutor_parent', guoyu_ocr_parent_is_tutor(p_parent_id)
    );
  END IF;

  UPDATE parent_guoyu_tts_usage
  SET usage_count = usage_count + 1, updated_at = now()
  WHERE parent_id = p_parent_id AND hkt_month = v_month
  RETURNING usage_count INTO v_usage;

  v_remaining := GREATEST(v_cap - v_usage, 0);

  RETURN json_build_object(
    'ok', true,
    'cap', v_cap,
    'remaining', v_remaining,
    'usage_count', v_usage,
    'hkt_month', v_month,
    'is_paid_parent', (v_cap = 10),
    'is_tutor_parent', guoyu_ocr_parent_is_tutor(p_parent_id)
  );
END;
$$;

REVOKE ALL ON TABLE public.parent_guoyu_tts_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.parent_guoyu_tts_usage TO service_role;

GRANT EXECUTE ON FUNCTION public.get_parent_guoyu_tts_quota(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_parent_guoyu_tts_quota(UUID) TO service_role;
