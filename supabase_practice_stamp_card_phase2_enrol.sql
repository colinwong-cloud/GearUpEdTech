-- Practice stamp card Phase 2 — explicit enrol RPC (UI「開始收集印花」)
-- Run after supabase_practice_stamp_card_phase1.sql

CREATE OR REPLACE FUNCTION enrol_student_stamp_card(p_student_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
BEGIN
  IF p_student_id IS NULL THEN
    RETURN json_build_object('enrolled', false, 'reason', 'invalid_student');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id) THEN
    RETURN json_build_object('enrolled', false, 'reason', 'invalid_student');
  END IF;

  IF NOT stamp_program_is_open() THEN
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

GRANT EXECUTE ON FUNCTION enrol_student_stamp_card(UUID) TO anon, authenticated, service_role;
