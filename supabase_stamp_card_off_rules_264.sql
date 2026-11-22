-- ============================================================
-- Soft #264 — Stamp card off-period rules (idempotent HOLD)
-- Apply only after explicit owner YES. Gear Up prod: hptttwbmwjaroazkosvr
-- ============================================================

ALTER TABLE stamp_program_settings
  ADD COLUMN IF NOT EXISTS program_closed_on_hkt_date DATE;

CREATE OR REPLACE FUNCTION stamp_program_closed_on_hkt_date()
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT program_closed_on_hkt_date
  FROM stamp_program_settings
  WHERE id = 1;
$$;

/** New enrol / implicit card create: open program or still on switch-off HKT calendar day. */
CREATE OR REPLACE FUNCTION stamp_program_allows_new_enrol(p_hkt DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT stamp_program_is_open()
    OR (
      stamp_program_closed_on_hkt_date() IS NOT NULL
      AND p_hkt = stamp_program_closed_on_hkt_date()
    );
$$;

CREATE OR REPLACE FUNCTION stamp_program_show_stamp_card(
  p_program_open BOOLEAN,
  p_closed_on DATE,
  p_today DATE,
  p_has_active_card BOOLEAN,
  p_stamp_count INTEGER,
  p_effective_streak INTEGER,
  p_last_stamp_hkt_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_yesterday DATE;
BEGIN
  IF p_program_open THEN
    RETURN true;
  END IF;

  IF NOT p_has_active_card THEN
    IF p_closed_on IS NOT NULL AND p_today = p_closed_on THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  v_yesterday := (p_today - 1);

  IF p_effective_streak <= 0
     AND p_last_stamp_hkt_date IS NOT NULL
     AND p_last_stamp_hkt_date IS DISTINCT FROM p_today
     AND p_last_stamp_hkt_date IS DISTINCT FROM v_yesterday THEN
    RETURN false;
  END IF;

  IF COALESCE(p_stamp_count, 0) <= 0
     AND p_closed_on IS NOT NULL
     AND p_today > p_closed_on THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION stamp_program_set_open(
  p_open BOOLEAN,
  p_admin_identifier TEXT DEFAULT 'admin'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old BOOLEAN;
  v_new BOOLEAN;
  v_closed_on DATE;
  v_today_hkt DATE;
BEGIN
  v_today_hkt := (timezone('Asia/Hong_Kong', now()))::date;

  SELECT stamps_program_open INTO v_old FROM stamp_program_settings WHERE id = 1 FOR UPDATE;
  IF v_old IS NULL THEN
    INSERT INTO stamp_program_settings (id, stamps_program_open, program_closed_on_hkt_date)
    VALUES (1, p_open, CASE WHEN p_open THEN NULL ELSE v_today_hkt END);
    v_old := true;
  ELSE
  IF p_open THEN
    UPDATE stamp_program_settings
    SET stamps_program_open = true,
        program_closed_on_hkt_date = NULL,
        updated_at = now()
    WHERE id = 1;
  ELSE
    UPDATE stamp_program_settings
    SET stamps_program_open = false,
        program_closed_on_hkt_date = COALESCE(program_closed_on_hkt_date, v_today_hkt),
        updated_at = now()
    WHERE id = 1;
  END IF;
  END IF;

  SELECT stamps_program_open, program_closed_on_hkt_date
  INTO v_new, v_closed_on
  FROM stamp_program_settings WHERE id = 1;

  IF v_old IS DISTINCT FROM v_new THEN
    INSERT INTO stamp_program_settings_audit (
      admin_identifier, setting_key, old_value, new_value
    ) VALUES (
      COALESCE(NULLIF(btrim(p_admin_identifier), ''), 'admin'),
      'stamps_program_open',
      v_old::text,
      v_new::text
    );
  END IF;

  RETURN json_build_object(
    'stamps_program_open', v_new,
    'program_closed_on_hkt_date', v_closed_on
  );
END;
$$;

CREATE OR REPLACE FUNCTION enrol_student_stamp_card(p_student_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
  v_today DATE;
BEGIN
  IF p_student_id IS NULL THEN
    RETURN json_build_object('enrolled', false, 'reason', 'invalid_student');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id) THEN
    RETURN json_build_object('enrolled', false, 'reason', 'invalid_student');
  END IF;

  v_today := (timezone('Asia/Hong_Kong', now()))::date;

  IF NOT stamp_program_allows_new_enrol(v_today) THEN
    RETURN json_build_object('enrolled', false, 'reason', 'enrolment_closed');
  END IF;

  SELECT * INTO v_card
  FROM student_stamp_cards
  WHERE student_id = p_student_id AND status = 'active'
  LIMIT 1;

  IF v_card IS NOT NULL THEN
    RETURN json_build_object('enrolled', true, 'already_enrolled', true, 'stamp_card_id', v_card.id);
  END IF;

  INSERT INTO student_stamp_cards (student_id, cycle_number, status, stamp_count, current_streak)
  VALUES (p_student_id, 1, 'active', 0, 0)
  RETURNING id INTO v_card;

  RETURN json_build_object('enrolled', true, 'stamp_card_id', v_card.id);
END;
$$;

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
  v_program_open BOOLEAN;
  v_card RECORD;
  v_new_streak INTEGER;
  v_daily_id UUID;
  v_stamp_count INTEGER;
  v_last_stamp DATE;
  v_stored_streak INTEGER;
  v_enrolled_new_card BOOLEAN := false;
  v_yesterday DATE;
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
  v_program_open := stamp_program_is_open();
  v_yesterday := (v_award_hkt - 1);

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
    IF NOT stamp_program_allows_new_enrol(v_award_hkt) THEN
      RETURN json_build_object('awarded', false, 'reason', 'enrolment_closed');
    END IF;
    INSERT INTO student_stamp_cards (student_id, cycle_number, status, stamp_count, current_streak)
    VALUES (v_student_id, 1, 'active', 0, 0)
    RETURNING * INTO v_card;
    v_enrolled_new_card := true;
  ELSE
    IF NOT v_program_open
       AND v_card.last_stamp_hkt_date IS NOT NULL
       AND v_card.last_stamp_hkt_date IS DISTINCT FROM v_award_hkt
       AND v_card.last_stamp_hkt_date IS DISTINCT FROM v_yesterday THEN
      RETURN json_build_object('awarded', false, 'reason', 'enrolment_closed');
    END IF;
  END IF;

  v_new_streak := stamp_program_streak_after_award(
    v_card.last_stamp_hkt_date,
    v_card.current_streak,
    v_award_hkt
  );

  INSERT INTO student_stamp_daily_awards (student_id, stamp_card_id, hkt_date, quiz_session_id)
  VALUES (v_card.student_id, v_card.id, v_award_hkt, p_session_id)
  ON CONFLICT (student_id, hkt_date) DO NOTHING
  RETURNING id INTO v_daily_id;

  IF v_daily_id IS NULL THEN
    RETURN json_build_object('awarded', false, 'reason', 'already_stamped_today', 'hkt_date', v_award_hkt);
  END IF;

  v_stamp_count := CASE
    WHEN v_card.last_stamp_hkt_date IS NULL THEN 1
    WHEN v_card.last_stamp_hkt_date = v_award_hkt THEN v_card.stamp_count
    WHEN v_card.last_stamp_hkt_date = v_yesterday THEN v_card.stamp_count + 1
    ELSE 1
  END;

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

CREATE OR REPLACE FUNCTION get_student_stamp_card_status(p_student_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_settings RECORD;
  v_card RECORD;
  v_effective_streak INTEGER;
  v_show BOOLEAN;
  v_program_open BOOLEAN;
  v_closed_on DATE;
BEGIN
  v_today := (timezone('Asia/Hong_Kong', now()))::date;
  SELECT stamps_program_open, stamps_per_card, program_closed_on_hkt_date INTO v_settings
  FROM stamp_program_settings WHERE id = 1;

  v_program_open := COALESCE(v_settings.stamps_program_open, true);
  v_closed_on := v_settings.program_closed_on_hkt_date;

  SELECT * INTO v_card
  FROM student_stamp_cards
  WHERE student_id = p_student_id AND status = 'active';

  IF v_card IS NULL THEN
    v_show := stamp_program_show_stamp_card(
      v_program_open,
      v_closed_on,
      v_today,
      false,
      0,
      0,
      NULL
    );
    RETURN json_build_object(
      'has_active_card', false,
      'show_stamp_card', v_show,
      'stamps_program_open', v_program_open,
      'program_closed_on_hkt_date', v_closed_on,
      'stamps_per_card', COALESCE(v_settings.stamps_per_card, 20),
      'stamp_count', 0,
      'streak', 0,
      'last_stamp_hkt_date', NULL,
      'stamped_today', false
    );
  END IF;

  v_effective_streak := stamp_program_effective_streak(
    v_card.last_stamp_hkt_date,
    v_card.current_streak,
    v_today
  );

  v_show := stamp_program_show_stamp_card(
    v_program_open,
    v_closed_on,
    v_today,
    true,
    v_card.stamp_count,
    v_effective_streak,
    v_card.last_stamp_hkt_date
  );

  RETURN json_build_object(
    'has_active_card', true,
    'show_stamp_card', v_show,
    'stamp_card_id', v_card.id,
    'cycle_number', v_card.cycle_number,
    'stamps_program_open', v_program_open,
    'program_closed_on_hkt_date', v_closed_on,
    'stamps_per_card', COALESCE(v_settings.stamps_per_card, 20),
    'stamp_count', v_card.stamp_count,
    'stored_streak', v_card.current_streak,
    'streak', v_effective_streak,
    'last_stamp_hkt_date', v_card.last_stamp_hkt_date,
    'stamped_today', (v_card.last_stamp_hkt_date = v_today)
  );
END;
$$;

CREATE OR REPLACE FUNCTION redeem_student_practice_stamp(p_student_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_settings RECORD;
  v_card RECORD;
  v_goal INTEGER;
  v_effective_streak INTEGER;
  v_gift RECORD;
  v_code_id UUID;
  v_code TEXT;
  v_redemption_id UUID;
  v_next_cycle INTEGER;
  v_redeem_ts TIMESTAMPTZ := now();
  v_redeem_date_hkt TEXT;
  v_parent_email TEXT;
  v_program_open BOOLEAN;
BEGIN
  IF p_student_id IS NULL OR NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_student');
  END IF;

  v_today := (timezone('Asia/Hong_Kong', v_redeem_ts))::date;
  v_redeem_date_hkt := to_char(timezone('Asia/Hong_Kong', v_redeem_ts), 'YYYY-MM-DD');

  SELECT stamps_per_card, stamps_program_open INTO v_settings FROM stamp_program_settings WHERE id = 1;
  v_goal := COALESCE(v_settings.stamps_per_card, 20);
  v_program_open := COALESCE(v_settings.stamps_program_open, true);

  SELECT * INTO v_card
  FROM student_stamp_cards
  WHERE student_id = p_student_id AND status = 'active'
  FOR UPDATE;

  IF v_card IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'no_active_card');
  END IF;

  v_effective_streak := stamp_program_effective_streak(
    v_card.last_stamp_hkt_date,
    v_card.current_streak,
    v_today
  );

  IF v_effective_streak < v_goal THEN
    RETURN json_build_object('ok', false, 'reason', 'streak_incomplete', 'streak', v_effective_streak);
  END IF;

  SELECT * INTO v_gift FROM stamp_pick_listed_gift_with_stock(v_today);

  IF v_gift.gift_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM stamp_gifts g
      WHERE g.status = 'listed'
        AND v_today >= g.window_start_hkt
        AND v_today <= g.window_end_hkt
    ) THEN
      RETURN json_build_object('ok', false, 'reason', 'window_closed');
    END IF;
    RETURN json_build_object('ok', false, 'reason', 'out_of_stock');
  END IF;

  SELECT c.id, c.code INTO v_code_id, v_code
  FROM stamp_gift_codes c
  WHERE c.gift_id = v_gift.gift_id AND c.status = 'unused'
  ORDER BY c.created_at ASC, c.id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_code_id IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'out_of_stock');
  END IF;

  SELECT p.email INTO v_parent_email
  FROM students s
  JOIN parents p ON p.id = s.parent_id
  WHERE s.id = p_student_id;

  INSERT INTO student_stamp_redemptions (
    student_id,
    stamp_card_id,
    gift_id,
    gift_name,
    face_value_hkd,
    ecoupon_code,
    email_status
  ) VALUES (
    p_student_id,
    v_card.id,
    v_gift.gift_id,
    v_gift.gift_name_tc,
    v_gift.face_value_hkd,
    v_code,
    'pending'
  )
  RETURNING id INTO v_redemption_id;

  UPDATE stamp_gift_codes
  SET status = 'used',
      used_at = v_redeem_ts,
      redemption_id = v_redemption_id
  WHERE id = v_code_id;

  UPDATE student_stamp_cards
  SET status = 'redeemed',
      redeemed_at = v_redeem_ts,
      updated_at = v_redeem_ts
  WHERE id = v_card.id;

  IF v_program_open THEN
    SELECT COALESCE(MAX(cycle_number), 0) + 1 INTO v_next_cycle
    FROM student_stamp_cards
    WHERE student_id = p_student_id;

    INSERT INTO student_stamp_cards (
      student_id, cycle_number, status, stamp_count, current_streak
    ) VALUES (
      p_student_id, v_next_cycle, 'active', 0, 0
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'coupon_code', v_code,
    'gift_name', v_gift.gift_name_tc,
    'face_value_hkd', v_gift.face_value_hkd,
    'redeem_date_hkt', v_redeem_date_hkt,
    'parent_email', v_parent_email,
    'window_end_hkt', v_gift.window_end_hkt,
    'started_new_cycle', v_program_open
  );
END;
$$;

GRANT EXECUTE ON FUNCTION stamp_program_closed_on_hkt_date() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION stamp_program_allows_new_enrol(DATE) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION stamp_program_show_stamp_card(BOOLEAN, DATE, DATE, BOOLEAN, INTEGER, INTEGER, DATE)
  TO anon, authenticated, service_role;