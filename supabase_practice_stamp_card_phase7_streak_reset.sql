-- ============================================================
-- Practice stamp card — Phase 7 (streak break display + admin resume stamp count)
-- *** DO NOT RUN without explicit owner YES from GearUp Team / Colin ***
-- Apply after Phase 1 and Phase 6 SQL. Idempotent.
-- ============================================================

ALTER TABLE student_stamp_card_resume_audit
  ADD COLUMN IF NOT EXISTS prior_stamp_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS new_stamp_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS new_current_streak INTEGER NULL;

CREATE OR REPLACE FUNCTION award_practice_stamp_for_session(p_session_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_answer_count INTEGER;
  v_award_hkt DATE;
  v_yesterday DATE;
  v_program_open BOOLEAN;
  v_card RECORD;
  v_new_streak INTEGER;
  v_daily_id UUID;
  v_stamp_count INTEGER;
  v_last_stamp DATE;
  v_stored_streak INTEGER;
  v_enrolled_new_card BOOLEAN := false;
  v_streak_gap BOOLEAN;
BEGIN
  SELECT qs.student_id INTO v_student_id
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id;

  IF v_student_id IS NULL THEN
    RETURN json_build_object('awarded', false, 'reason', 'session_not_found');
  END IF;

  SELECT COUNT(*)::int INTO v_answer_count
  FROM session_answers sa
  WHERE sa.session_id = p_session_id;

  IF v_answer_count < 10 THEN
    RETURN json_build_object(
      'awarded', false,
      'reason', 'insufficient_answers',
      'answered_count', v_answer_count
    );
  END IF;

  v_award_hkt := (timezone('Asia/Hong_Kong', now()))::date;
  v_yesterday := (v_award_hkt - 1);
  v_program_open := stamp_program_is_open();

  IF EXISTS (
    SELECT 1 FROM student_stamp_daily_awards d
    WHERE d.student_id = v_student_id AND d.hkt_date = v_award_hkt
  ) THEN
    SELECT c.stamp_count, c.current_streak, c.last_stamp_hkt_date
    INTO v_stamp_count, v_stored_streak, v_last_stamp
    FROM student_stamp_cards c
    WHERE c.student_id = v_student_id AND c.status = 'active'
    LIMIT 1;
    RETURN json_build_object(
      'awarded', false,
      'reason', 'already_stamped_today',
      'hkt_date', v_award_hkt,
      'stamp_count', COALESCE(v_stamp_count, 0),
      'streak', stamp_program_effective_streak(
        v_last_stamp,
        COALESCE(v_stored_streak, 0),
        v_award_hkt
      )
    );
  END IF;

  SELECT * INTO v_card
  FROM student_stamp_cards
  WHERE student_id = v_student_id AND status = 'active'
  FOR UPDATE;

  IF v_card IS NULL THEN
    IF NOT v_program_open THEN
      RETURN json_build_object('awarded', false, 'reason', 'enrolment_closed');
    END IF;
    INSERT INTO student_stamp_cards (student_id, cycle_number, status, stamp_count, current_streak)
    VALUES (v_student_id, 1, 'active', 0, 0)
    RETURNING * INTO v_card;
    v_enrolled_new_card := true;
  END IF;

  v_new_streak := stamp_program_streak_after_award(
    v_card.last_stamp_hkt_date,
    v_card.current_streak,
    v_award_hkt
  );

  v_streak_gap := v_card.last_stamp_hkt_date IS NULL
    OR (
      v_card.last_stamp_hkt_date <> v_award_hkt
      AND v_card.last_stamp_hkt_date <> v_yesterday
    );

  IF v_streak_gap THEN
    v_stamp_count := 1;
  ELSE
    v_stamp_count := v_card.stamp_count + 1;
  END IF;

  INSERT INTO student_stamp_daily_awards (student_id, stamp_card_id, hkt_date, quiz_session_id)
  VALUES (v_card.student_id, v_card.id, v_award_hkt, p_session_id)
  ON CONFLICT (student_id, hkt_date) DO NOTHING
  RETURNING id INTO v_daily_id;

  IF v_daily_id IS NULL THEN
    RETURN json_build_object('awarded', false, 'reason', 'already_stamped_today', 'hkt_date', v_award_hkt);
  END IF;

  UPDATE student_stamp_cards
  SET stamp_count = v_stamp_count,
      current_streak = v_new_streak,
      last_stamp_hkt_date = v_award_hkt,
      updated_at = now()
  WHERE id = v_card.id;

  RETURN json_build_object(
    'awarded', true,
    'hkt_date', v_award_hkt,
    'stamp_count', v_stamp_count,
    'streak', v_new_streak,
    'stamp_card_id', v_card.id,
    'enrolled_new_card', v_enrolled_new_card
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_stamp_student_progress_resume(
  p_stamp_card_id UUID,
  p_admin_identifier TEXT DEFAULT 'admin',
  p_target_stamp_count INTEGER DEFAULT NULL
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
  v_target INTEGER;
  v_stamps_per_card INTEGER;
BEGIN
  IF p_stamp_card_id IS NULL THEN
    RAISE EXCEPTION '缺少印花卡 id';
  END IF;

  v_today := (timezone('Asia/Hong_Kong', now()))::date;
  v_yesterday := (v_today - 1);

  SELECT stamps_per_card INTO v_stamps_per_card
  FROM stamp_program_settings WHERE id = 1;
  v_stamps_per_card := COALESCE(v_stamps_per_card, 20);

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

  IF p_target_stamp_count IS NULL THEN
    v_target := v_card.stamp_count;
  ELSE
    IF p_target_stamp_count < 0 OR p_target_stamp_count > v_stamps_per_card THEN
      RAISE EXCEPTION '蓋印數須為 0 至 %', v_stamps_per_card;
    END IF;
    v_target := p_target_stamp_count;
  END IF;

  INSERT INTO student_stamp_card_resume_audit (
    stamp_card_id,
    student_id,
    admin_identifier,
    prior_last_stamp_hkt_date,
    prior_current_streak,
    new_last_stamp_hkt_date,
    prior_stamp_count,
    new_stamp_count,
    new_current_streak
  ) VALUES (
    v_card.id,
    v_card.student_id,
    COALESCE(NULLIF(btrim(p_admin_identifier), ''), 'admin'),
    v_card.last_stamp_hkt_date,
    v_card.current_streak,
    v_yesterday,
    v_card.stamp_count,
    v_target,
    v_target
  );

  UPDATE student_stamp_cards
  SET last_stamp_hkt_date = v_yesterday,
      stamp_count = v_target,
      current_streak = v_target,
      updated_at = now()
  WHERE id = v_card.id;

  RETURN json_build_object(
    'stamp_card_id', v_card.id,
    'student_id', v_card.student_id,
    'last_stamp_hkt_date', v_yesterday,
    'stored_streak', v_target,
    'effective_streak', stamp_program_effective_streak(
      v_yesterday,
      v_target,
      v_today
    ),
    'stamp_count', v_target
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_stamp_student_progress_resume(UUID, TEXT, INTEGER) TO service_role;
