-- ============================================================
-- Practice stamp card — Phase 4 (admin gift catalog + coupon codes)
-- *** DO NOT RUN without explicit owner YES from GearUp Team / Colin ***
-- Apply after Phase 1–3 SQL. UI ships against these tables via admin API.
-- ============================================================

-- Gift catalog (admin-managed)
CREATE TABLE IF NOT EXISTS stamp_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_tc TEXT NOT NULL CHECK (char_length(btrim(name_tc)) > 0),
  face_value_hkd INTEGER NOT NULL CHECK (face_value_hkd >= 0),
  window_start_hkt DATE NOT NULL,
  window_end_hkt DATE NOT NULL CHECK (window_end_hkt >= window_start_hkt),
  status TEXT NOT NULL DEFAULT 'unlisted'
    CHECK (status IN ('listed', 'unlisted')),
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stamp_gifts_status_window_idx
  ON stamp_gifts (status, window_start_hkt, window_end_hkt);

ALTER TABLE stamp_gifts ENABLE ROW LEVEL SECURITY;

-- E-coupon codes (imported CSV; one code row per physical/digital voucher)
CREATE TABLE IF NOT EXISTS stamp_gift_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id UUID NOT NULL REFERENCES stamp_gifts(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (char_length(btrim(code)) > 0),
  status TEXT NOT NULL DEFAULT 'unused'
    CHECK (status IN ('unused', 'used')),
  used_at TIMESTAMPTZ,
  redemption_id UUID REFERENCES student_stamp_redemptions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stamp_gift_codes_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS stamp_gift_codes_gift_status_idx
  ON stamp_gift_codes (gift_id, status);

ALTER TABLE stamp_gift_codes ENABLE ROW LEVEL SECURITY;

-- Redemption report: optional gift link + manual admin actor (Phase 5 assign may populate)
ALTER TABLE student_stamp_redemptions
  ADD COLUMN IF NOT EXISTS gift_id UUID REFERENCES stamp_gifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_actor TEXT;

COMMENT ON COLUMN student_stamp_redemptions.admin_actor IS
  'Admin console identifier when redemption was recorded manually (Phase 5+).';

CREATE INDEX IF NOT EXISTS student_stamp_redemptions_redeemed_at_idx
  ON student_stamp_redemptions (redeemed_at DESC);

-- No direct client access; admin API uses service_role
DROP POLICY IF EXISTS stamp_gifts_deny_all ON stamp_gifts;
CREATE POLICY stamp_gifts_deny_all ON stamp_gifts
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS stamp_gift_codes_deny_all ON stamp_gift_codes;
CREATE POLICY stamp_gift_codes_deny_all ON stamp_gift_codes
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Touch updated_at on gift edits
CREATE OR REPLACE FUNCTION stamp_gifts_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_gifts_updated_at ON stamp_gifts;
CREATE TRIGGER stamp_gifts_updated_at
  BEFORE UPDATE ON stamp_gifts
  FOR EACH ROW EXECUTE FUNCTION stamp_gifts_set_updated_at();
