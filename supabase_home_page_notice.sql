-- Home page notice (singleton) — run in Supabase SQL Editor (not auto-applied to prod)
-- Controls optional poster + text on 選擇身份 screen (fail-closed when disabled or empty).

CREATE TABLE IF NOT EXISTS home_page_notice_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT false,
  body_text TEXT,
  image_url TEXT,
  link_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO home_page_notice_settings (id, enabled, body_text, image_url, link_url)
VALUES (1, false, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE home_page_notice_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_home_page_notice_public()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row home_page_notice_settings%ROWTYPE;
  v_body TEXT;
  v_image TEXT;
  v_link TEXT;
BEGIN
  SELECT * INTO v_row FROM home_page_notice_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN json_build_object('visible', false);
  END IF;

  IF NOT COALESCE(v_row.enabled, false) THEN
    RETURN json_build_object('visible', false);
  END IF;

  v_body := NULLIF(trim(COALESCE(v_row.body_text, '')), '');
  v_image := NULLIF(trim(COALESCE(v_row.image_url, '')), '');
  v_link := NULLIF(trim(COALESCE(v_row.link_url, '')), '');

  IF v_body IS NULL AND v_image IS NULL THEN
    RETURN json_build_object('visible', false);
  END IF;

  RETURN json_build_object(
    'visible', true,
    'body_text', v_body,
    'image_url', v_image,
    'link_url', v_link
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_home_page_notice_public() TO anon, authenticated, service_role;
