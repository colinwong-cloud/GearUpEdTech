-- ============================================================
-- Practice stamp card — Phase 6 (admin student progress + CS resume)
-- *** DO NOT RUN without explicit owner YES from GearUp Team / Colin ***
-- Apply after Phase 1 SQL. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_stamp_card_resume_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stamp_card_id UUID NOT NULL REFERENCES student_stamp_cards(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  admin_identifier TEXT NOT NULL DEFAULT 'admin',
  prior_last_stamp_hkt_date DATE NULL,
  prior_current_streak INTEGER NOT NULL CHECK (prior_current_streak >= 0),
  new_last_stamp_hkt_date DATE NOT NULL,
  resumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_stamp_card_resume_audit_card_idx
  ON student_stamp_card_resume_audit (stamp_card_id, resumed_at DESC);

ALTER TABLE student_stamp_card_resume_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION admin_stamp_student_progress_resume(
  p_stamp_card_id UUID,
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
  v_effective INTEGER;
BEGIN
  IF p_stamp_card_id IS NULL THEN
    RAISE EXCEPTION '缺少印花卡 id';
  END IF;

  v_today := (timezone('Asia/Hong_Kong', now()))::date;
  v_yesterday := (v_today - 1);

  SELECT * INTO v_card
  FROM student_stamp_cards
  WHERE id = p_stamp_card_id AND status = 'active'
  FOR UPDATE;

  IF v_card IS NULL THEN
    RAISE EXCEPTION '找不到進行中的印花卡';
  END IF;

  IF v_card.stamp_count <= 0 OR v_card.current_streak <= 0 OR v_card.last_stamp_hkt_date IS NULL THEN
    RAISE EXCEPTION '此印花卡不符合恢復條件';
  END IF;

  v_effective := stamp_program_effective_streak(
    v_card.last_stamp_hkt_date,
    v_card.current_streak,
    v_today
  );

  IF v_effective > 0 THEN
    RAISE EXCEPTION '連續天數未中斷，無需恢復';
  END IF;

  IF v_card.last_stamp_hkt_date >= v_yesterday THEN
    RAISE EXCEPTION '此印花卡不符合恢復條件';
  END IF;

  INSERT INTO student_stamp_card_resume_audit (
    stamp_card_id,
    student_id,
    admin_identifier,
    prior_last_stamp_hkt_date,
    prior_current_streak,
    new_last_stamp_hkt_date
  ) VALUES (
    v_card.id,
    v_card.student_id,
    COALESCE(NULLIF(btrim(p_admin_identifier), ''), 'admin'),
    v_card.last_stamp_hkt_date,
    v_card.current_streak,
    v_yesterday
  );

  UPDATE student_stamp_cards
  SET last_stamp_hkt_date = v_yesterday,
      updated_at = now()
  WHERE id = v_card.id;

  RETURN json_build_object(
    'stamp_card_id', v_card.id,
    'student_id', v_card.student_id,
    'last_stamp_hkt_date', v_yesterday,
    'stored_streak', v_card.current_streak,
    'effective_streak', stamp_program_effective_streak(
      v_yesterday,
      v_card.current_streak,
      v_today
    ),
    'stamp_count', v_card.stamp_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_stamp_student_progress_resume(UUID, TEXT) TO service_role;
