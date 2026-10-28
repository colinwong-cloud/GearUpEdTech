-- ============================================================
-- Practice stamp card — Phase 1 (schema + earn/streak hook)
-- Run in Supabase Dashboard > SQL Editor (idempotent)
-- ============================================================

-- Program settings (singleton)
CREATE TABLE IF NOT EXISTS stamp_program_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stamps_program_open BOOLEAN NOT NULL DEFAULT true,
  stamps_per_card INTEGER NOT NULL DEFAULT 10 CHECK (stamps_per_card > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO stamp_program_settings (id, stamps_program_open, stamps_per_card)
VALUES (1, true, 10)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE stamp_program_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS stamp_program_settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_identifier TEXT NOT NULL DEFAULT 'system',
  setting_key TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  toggled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  toggled_at_hkt DATE NOT NULL GENERATED ALWAYS AS (
    (timezone('Asia/Hong_Kong', toggled_at))::date
  ) STORED
);

ALTER TABLE stamp_program_settings_audit ENABLE ROW LEVEL SECURITY;

-- Student stamp cards (multi-cycle: active | redeemed)
CREATE TABLE IF NOT EXISTS student_stamp_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number >= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed')),
  stamp_count INTEGER NOT NULL DEFAULT 0 CHECK (stamp_count >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  last_stamp_hkt_date DATE NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS student_stamp_cards_one_active_per_student
  ON student_stamp_cards (student_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS student_stamp_cards_student_id_idx
  ON student_stamp_cards (student_id);

ALTER TABLE student_stamp_cards ENABLE ROW LEVEL SECURITY;

-- At most one stamp per student per HKT calendar day
CREATE TABLE IF NOT EXISTS student_stamp_daily_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stamp_card_id UUID NOT NULL REFERENCES student_stamp_cards(id) ON DELETE CASCADE,
  hkt_date DATE NOT NULL,
  quiz_session_id UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_stamp_daily_awards_student_hkt_unique UNIQUE (student_id, hkt_date),
  CONSTRAINT student_stamp_daily_awards_session_unique UNIQUE (quiz_session_id)
);

CREATE INDEX IF NOT EXISTS student_stamp_daily_awards_hkt_date_idx
  ON student_stamp_daily_awards (hkt_date);

ALTER TABLE student_stamp_daily_awards ENABLE ROW LEVEL SECURITY;

-- Stub for Phase 4+ redeem records (no UI in Phase 1)
CREATE TABLE IF NOT EXISTS student_stamp_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stamp_card_id UUID NOT NULL REFERENCES student_stamp_cards(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_hkt_date DATE NOT NULL GENERATED ALWAYS AS (
    (timezone('Asia/Hong_Kong', redeemed_at))::date
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE student_stamp_redemptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION stamp_program_is_open()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT stamps_program_open FROM stamp_program_settings WHERE id = 1),
    true
  );
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
BEGIN
  SELECT stamps_program_open INTO v_old FROM stamp_program_settings WHERE id = 1 FOR UPDATE;
  IF v_old IS NULL THEN
    INSERT INTO stamp_program_settings (id, stamps_program_open) VALUES (1, p_open);
    v_old := true;
  ELSE
    UPDATE stamp_program_settings
    SET stamps_program_open = p_open, updated_at = now()
    WHERE id = 1;
  END IF;

  v_new := p_open;
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

  RETURN json_build_object('stamps_program_open', v_new);
END;
$$;

CREATE OR REPLACE FUNCTION stamp_program_effective_streak(
  p_last_stamp_hkt_date DATE,
  p_stored_streak INTEGER,
  p_today_hkt DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_yesterday DATE;
BEGIN
  IF p_last_stamp_hkt_date IS NULL OR p_stored_streak <= 0 THEN
    RETURN 0;
  END IF;
  v_yesterday := (p_today_hkt - 1);
  IF p_last_stamp_hkt_date = p_today_hkt OR p_last_stamp_hkt_date = v_yesterday THEN
    RETURN GREATEST(0, p_stored_streak);
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION stamp_program_streak_after_award(
  p_last_stamp_hkt_date DATE,
  p_stored_streak INTEGER,
  p_award_hkt DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_yesterday DATE;
BEGIN
  IF p_last_stamp_hkt_date IS NULL THEN
    RETURN 1;
  END IF;
  IF p_last_stamp_hkt_date = p_award_hkt THEN
    RETURN GREATEST(0, p_stored_streak);
  END IF;
  v_yesterday := (p_award_hkt - 1);
  IF p_last_stamp_hkt_date = v_yesterday THEN
    RETURN GREATEST(1, p_stored_streak + 1);
  END IF;
  RETURN 1;
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

  INSERT INTO student_stamp_daily_awards (student_id, stamp_card_id, hkt_date, quiz_session_id)
  VALUES (v_card.student_id, v_card.id, v_award_hkt, p_session_id)
  ON CONFLICT (student_id, hkt_date) DO NOTHING
  RETURNING id INTO v_daily_id;

  IF v_daily_id IS NULL THEN
    RETURN json_build_object('awarded', false, 'reason', 'already_stamped_today', 'hkt_date', v_award_hkt);
  END IF;

  v_stamp_count := v_card.stamp_count + 1;

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
BEGIN
  v_today := (timezone('Asia/Hong_Kong', now()))::date;
  SELECT stamps_program_open, stamps_per_card INTO v_settings
  FROM stamp_program_settings WHERE id = 1;

  SELECT * INTO v_card
  FROM student_stamp_cards
  WHERE student_id = p_student_id AND status = 'active';

  IF v_card IS NULL THEN
    RETURN json_build_object(
      'has_active_card', false,
      'stamps_program_open', COALESCE(v_settings.stamps_program_open, true),
      'stamps_per_card', COALESCE(v_settings.stamps_per_card, 10),
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

  RETURN json_build_object(
    'has_active_card', true,
    'stamp_card_id', v_card.id,
    'cycle_number', v_card.cycle_number,
    'stamps_program_open', COALESCE(v_settings.stamps_program_open, true),
    'stamps_per_card', COALESCE(v_settings.stamps_per_card, 10),
    'stamp_count', v_card.stamp_count,
    'stored_streak', v_card.current_streak,
    'streak', v_effective_streak,
    'last_stamp_hkt_date', v_card.last_stamp_hkt_date,
    'stamped_today', (v_card.last_stamp_hkt_date = v_today)
  );
END;
$$;

CREATE OR REPLACE FUNCTION stamp_program_kpi_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_cards INTEGER;
  v_stamps_today INTEGER;
  v_stamps_mtd INTEGER;
  v_today DATE;
  v_month_start DATE;
BEGIN
  v_today := (timezone('Asia/Hong_Kong', now()))::date;
  v_month_start := date_trunc('month', v_today::timestamp)::date;

  SELECT COUNT(*)::int INTO v_active_cards
  FROM student_stamp_cards c
  JOIN students s ON s.id = c.student_id
  JOIN parents p ON p.id = s.parent_id
  WHERE c.status = 'active'
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

  SELECT COUNT(*)::int INTO v_stamps_today
  FROM student_stamp_daily_awards d
  JOIN students s ON s.id = d.student_id
  JOIN parents p ON p.id = s.parent_id
  WHERE d.hkt_date = v_today
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

  SELECT COUNT(*)::int INTO v_stamps_mtd
  FROM student_stamp_daily_awards d
  JOIN students s ON s.id = d.student_id
  JOIN parents p ON p.id = s.parent_id
  WHERE d.hkt_date >= v_month_start AND d.hkt_date <= v_today
    AND (p.mobile_number IS NULL OR p.mobile_number NOT LIKE '9999%');

  RETURN json_build_object(
    'active_cards', v_active_cards,
    'stamps_awarded_today', v_stamps_today,
    'stamps_awarded_mtd', v_stamps_mtd,
    'hkt_date', v_today
  );
END;
$$;

-- Hook stamp earn on session completion (same RPC the app already calls)
CREATE OR REPLACE FUNCTION update_quiz_session(
  p_session_id UUID,
  p_questions_attempted INTEGER,
  p_score INTEGER,
  p_time_spent_seconds INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stamp JSON;
BEGIN
  UPDATE quiz_sessions
  SET questions_attempted = p_questions_attempted,
      score = p_score,
      time_spent_seconds = p_time_spent_seconds
  WHERE id = p_session_id;

  v_stamp := award_practice_stamp_for_session(p_session_id);

  RETURN json_build_object(
    'session_updated', true,
    'practice_stamp', v_stamp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION stamp_program_is_open() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION stamp_program_set_open(BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION award_practice_stamp_for_session(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_student_stamp_card_status(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION stamp_program_kpi_summary() TO service_role;
GRANT EXECUTE ON FUNCTION update_quiz_session(UUID, INTEGER, INTEGER, INTEGER) TO anon, authenticated, service_role;
