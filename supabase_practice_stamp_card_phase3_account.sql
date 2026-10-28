-- ============================================================
-- Practice stamp card — Phase 3 (account redeem history read model)
-- Target: shared Supabase project (production). DO NOT run here without
-- GearUp Team owner approval. UI ships with empty history until applied + Phase 5 redeem.
-- ============================================================

ALTER TABLE student_stamp_redemptions
  ADD COLUMN IF NOT EXISTS gift_name TEXT,
  ADD COLUMN IF NOT EXISTS face_value_hkd INTEGER
    CHECK (face_value_hkd IS NULL OR face_value_hkd >= 0),
  ADD COLUMN IF NOT EXISTS ecoupon_code TEXT,
  ADD COLUMN IF NOT EXISTS email_status TEXT
    CHECK (email_status IS NULL OR email_status IN ('pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN student_stamp_redemptions.face_value_hkd IS
  'Immutable HKD face-value snapshot captured at redeem time (Finance locked; do not backfill from live catalog).';

CREATE INDEX IF NOT EXISTS student_stamp_redemptions_student_redeemed_idx
  ON student_stamp_redemptions (student_id, redeemed_at DESC);

CREATE OR REPLACE FUNCTION get_student_stamp_redeem_history(p_student_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.redeemed_at DESC)
      FROM (
        SELECT
          r.id,
          to_char(
            timezone('Asia/Hong_Kong', r.redeemed_at),
            'YYYY-MM-DD HH24:MI:SS'
          ) AS redeemed_at_hkt,
          r.redeemed_hkt_date,
          r.gift_name,
          r.face_value_hkd,
          r.ecoupon_code,
          r.email_status
        FROM student_stamp_redemptions r
        WHERE r.student_id = p_student_id
        ORDER BY r.redeemed_at DESC
        LIMIT 100
      ) t
    ),
    '[]'::json
  );
$$;

GRANT EXECUTE ON FUNCTION get_student_stamp_redeem_history(UUID) TO anon, authenticated, service_role;
