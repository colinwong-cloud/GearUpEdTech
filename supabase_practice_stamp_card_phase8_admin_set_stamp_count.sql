-- ============================================================
-- Practice stamp card — Phase 8 (admin stamp count adjust by parent lookup)
-- *** DO NOT RUN without explicit owner YES from GearUp Team / Colin ***
-- Apply after Phase 1 and Phase 7 SQL. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_stamp_card_admin_set_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stamp_card_id UUID NOT NULL REFERENCES student_stamp_cards(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  admin_identifier TEXT NOT NULL DEFAULT 'admin',
  prior_stamp_count INTEGER NOT NULL CHECK (prior_stamp_count >= 0),
  prior_current_streak INTEGER NOT NULL CHECK (prior_current_streak >= 0),
  prior_last_stamp_hkt_date DATE NULL,
  new_stamp_count INTEGER NOT NULL CHECK (new_stamp_count >= 0),
  new_current_streak INTEGER NOT NULL CHECK (new_current_streak >= 0),
  new_last_stamp_hkt_date DATE NOT NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_stamp_card_admin_set_audit_card_idx
  ON student_stamp_card_admin_set_audit (stamp_card_id, set_at DESC);

ALTER TABLE student_stamp_card_admin_set_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION admin_stamp_student_set_progress(
  p_student_id UUID,
  p_target_stamp_count INTEGER,
  p_admin_identifier TEXT DEFAULT 'admin'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_yesterday DATE;
  v_card RECORD;
  v_stamps_per_card INTEGER;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION '缺少學生 id';
  END IF;

  IF p_target_stamp_count IS NULL THEN
    RAISE EXCEPTION '蓋印數須為 0 至 20 的整數';
  END IF;

  v_today := (timezone('Asia/Hong_Kong', now()))::date;
  v_yesterday := (v_today - 1);

  SELECT stamps_per_card INTO v_stamps_per_card
  FROM stamp_program_settings WHERE id = 1;
  v_stamps_per_card := COALESCE(v_stamps_per_card, 20);

  IF p_target_stamp_count < 0 OR p_target_stamp_count > v_stamps_per_card THEN
    RAISE EXCEPTION '蓋印數須為 0 至 % 的整數', v_stamps_per_card;
  END IF;

  SELECT * INTO v_card
  FROM student_stamp_cards
  WHERE student_id = p_student_id AND status = 'active'
  FOR UPDATE;

  IF v_card IS NULL THEN
    RAISE EXCEPTION '無法調整：此學生沒有可更新的印花卡';
  END IF;

  INSERT INTO student_stamp_card_admin_set_audit (
    stamp_card_id,
    student_id,
    admin_identifier,
    prior_stamp_count,
    prior_current_streak,
    prior_last_stamp_hkt_date,
    new_stamp_count,
    new_current_streak,
    new_last_stamp_hkt_date
  ) VALUES (
    v_card.id,
    v_card.student_id,
    COALESCE(NULLIF(btrim(p_admin_identifier), ''), 'admin'),
    v_card.stamp_count,
    v_card.current_streak,
    v_card.last_stamp_hkt_date,
    p_target_stamp_count,
    p_target_stamp_count,
    v_yesterday
  );

  UPDATE student_stamp_cards
  SET stamp_count = p_target_stamp_count,
      current_streak = p_target_stamp_count,
      last_stamp_hkt_date = v_yesterday,
      updated_at = now()
  WHERE id = v_card.id;

  RETURN json_build_object(
    'stamp_card_id', v_card.id,
    'student_id', v_card.student_id,
    'stamp_count', p_target_stamp_count,
    'current_streak', p_target_stamp_count,
    'last_stamp_hkt_date', v_yesterday,
    'card_status', 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_stamp_student_set_progress(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_stamp_student_set_progress(UUID, INTEGER, TEXT) TO service_role;
