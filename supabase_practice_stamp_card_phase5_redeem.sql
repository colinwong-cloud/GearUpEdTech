-- ============================================================
-- Practice stamp card — Phase 5 (student redeem + gift assign + email fields)
-- *** DO NOT RUN without explicit owner YES from GearUp Team / Colin ***
-- Apply after Phase 1–4 SQL. Resend email is sent from Next.js API after RPC succeeds.
-- ============================================================

-- Gift pick policy (documented for PR):
--   listed gifts where today (HKT) is within [window_start_hkt, window_end_hkt]
--   with at least one unused code; choose earliest window_end_hkt, then created_at, then id.

CREATE OR REPLACE FUNCTION stamp_pick_listed_gift_with_stock(p_today_hkt DATE)
RETURNS TABLE (
  gift_id UUID,
  gift_name_tc TEXT,
  face_value_hkd INTEGER,
  window_end_hkt DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.name_tc, g.face_value_hkd, g.window_end_hkt
  FROM stamp_gifts g
  WHERE g.status = 'listed'
    AND p_today_hkt >= g.window_start_hkt
    AND p_today_hkt <= g.window_end_hkt
    AND EXISTS (
      SELECT 1 FROM stamp_gift_codes c
      WHERE c.gift_id = g.id AND c.status = 'unused'
    )
  ORDER BY g.window_end_hkt ASC, g.created_at ASC, g.id ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_student_stamp_redeem_offer(p_student_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE;
  v_settings RECORD;
  v_card RECORD;
  v_effective_streak INTEGER;
  v_goal INTEGER;
  v_gift RECORD;
  v_any_listed_in_window BOOLEAN;
  v_any_stock BOOLEAN;
BEGIN
  IF p_student_id IS NULL OR NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_student');
  END IF;

  v_today := (timezone('Asia/Hong_Kong', now()))::date;
  SELECT stamps_program_open, stamps_per_card INTO v_settings
  FROM stamp_program_settings WHERE id = 1;

  SELECT * INTO v_card
  FROM student_stamp_cards
  WHERE student_id = p_student_id AND status = 'active';

  v_goal := COALESCE(v_settings.stamps_per_card, 20);

  IF v_card IS NULL THEN
    RETURN json_build_object(
      'ok', true,
      'has_active_card', false,
      'stamps_program_open', COALESCE(v_settings.stamps_program_open, true),
      'stamps_per_card', v_goal,
      'streak', 0,
      'redeemable', false,
      'gift_window_open', false,
      'gift_in_stock', false
    );
  END IF;

  v_effective_streak := stamp_program_effective_streak(
    v_card.last_stamp_hkt_date,
    v_card.current_streak,
    v_today
  );

  SELECT EXISTS (
    SELECT 1 FROM stamp_gifts g
    WHERE g.status = 'listed'
      AND v_today >= g.window_start_hkt
      AND v_today <= g.window_end_hkt
  ) INTO v_any_listed_in_window;

  SELECT EXISTS (
    SELECT 1
    FROM stamp_gifts g
    JOIN stamp_gift_codes c ON c.gift_id = g.id AND c.status = 'unused'
    WHERE g.status = 'listed'
      AND v_today >= g.window_start_hkt
      AND v_today <= g.window_end_hkt
  ) INTO v_any_stock;

  SELECT * INTO v_gift FROM stamp_pick_listed_gift_with_stock(v_today);

  RETURN json_build_object(
    'ok', true,
    'has_active_card', true,
    'stamp_card_id', v_card.id,
    'stamps_program_open', COALESCE(v_settings.stamps_program_open, true),
    'stamps_per_card', v_goal,
    'streak', v_effective_streak,
    'redeemable', (v_effective_streak >= v_goal AND v_gift.gift_id IS NOT NULL),
    'gift_window_open', COALESCE(v_any_listed_in_window, false),
    'gift_in_stock', COALESCE(v_any_stock, false),
    'gift_id', v_gift.gift_id,
    'gift_name', v_gift.gift_name_tc,
    'face_value_hkd', v_gift.face_value_hkd,
    'window_end_hkt', v_gift.window_end_hkt
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
BEGIN
  IF p_student_id IS NULL OR NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id) THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_student');
  END IF;

  v_today := (timezone('Asia/Hong_Kong', v_redeem_ts))::date;
  v_redeem_date_hkt := to_char(timezone('Asia/Hong_Kong', v_redeem_ts), 'YYYY-MM-DD');

  SELECT stamps_per_card INTO v_settings FROM stamp_program_settings WHERE id = 1;
  v_goal := COALESCE(v_settings.stamps_per_card, 20);

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

  SELECT COALESCE(MAX(cycle_number), 0) + 1 INTO v_next_cycle
  FROM student_stamp_cards
  WHERE student_id = p_student_id;

  INSERT INTO student_stamp_cards (
    student_id, cycle_number, status, stamp_count, current_streak
  ) VALUES (
    p_student_id, v_next_cycle, 'active', 0, 0
  );

  RETURN json_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'coupon_code', v_code,
    'gift_name', v_gift.gift_name_tc,
    'face_value_hkd', v_gift.face_value_hkd,
    'redeem_date_hkt', v_redeem_date_hkt,
    'parent_email', v_parent_email,
    'window_end_hkt', v_gift.window_end_hkt
  );
END;
$$;

GRANT EXECUTE ON FUNCTION stamp_pick_listed_gift_with_stock(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION get_student_stamp_redeem_offer(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION redeem_student_practice_stamp(UUID) TO service_role;
