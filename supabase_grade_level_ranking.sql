-- ============================================================
-- Grade-level performance ranking (nightly batch + parent read)
-- Run in Supabase SQL Editor after backup.
-- - Eligible: sum(questions_attempted) in quiz_sessions >= 100
-- - Score: average of per-session correct % over last 10 sessions (or fewer if <10)
-- - Rank: RANK() among eligibles in same grade_level, higher avg = better (rank 1 = best)
-- ============================================================

CREATE TABLE IF NOT EXISTS student_grade_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  grade_level TEXT NOT NULL,
  student_id UUID NOT NULL,
  student_name TEXT NOT NULL,
  lifetime_questions INTEGER NOT NULL DEFAULT 0,
  session_count_in_avg INTEGER NOT NULL DEFAULT 0,
  last_10_avg_correct_pct NUMERIC(7,4),
  rank_in_grade INTEGER,
  total_eligible_in_grade INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_ranking_student_grade UNIQUE (grade_level, student_id)
);

CREATE INDEX IF NOT EXISTS idx_sgr_student ON student_grade_rankings (student_id);
CREATE INDEX IF NOT EXISTS idx_sgr_grade ON student_grade_rankings (grade_level);

ALTER TABLE student_grade_rankings ENABLE ROW LEVEL SECURITY;

-- No direct access; use RPC only (matches security model)

CREATE OR REPLACE FUNCTION recalculate_student_grade_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- WHERE true: required by some Supabase/Postgres configs (no unqualified table DELETE)
  DELETE FROM student_grade_rankings WHERE true;

  WITH session_rates AS (
    SELECT
      qs.student_id,
      qs.id AS session_id,
      (qs.score::numeric / NULLIF(qs.questions_attempted, 0)) * 100 AS rate_pct,
      row_number() OVER (PARTITION BY qs.student_id ORDER BY qs.created_at DESC) AS rn
    FROM quiz_sessions qs
    WHERE qs.student_id IS NOT NULL
      AND qs.questions_attempted > 0
  ),
  per_student AS (
    SELECT
      s.id AS student_id,
      s.grade_level,
      s.student_name,
      COALESCE((
        SELECT SUM(qs2.questions_attempted)::integer
        FROM quiz_sessions qs2
        WHERE qs2.student_id = s.id
          AND qs2.questions_attempted > 0
      ), 0) AS lifetime_questions,
      (
        SELECT COALESCE(ROUND(AVG(sr.rate_pct)::numeric, 4), NULL)
        FROM session_rates sr
        WHERE sr.student_id = s.id AND sr.rn <= 10
      ) AS last_10_avg,
      (
        SELECT COUNT(*)::integer
        FROM session_rates sr
        WHERE sr.student_id = s.id AND sr.rn <= 10
      ) AS session_count_in_avg
    FROM students s
  ),
  with_elig AS (
    SELECT
      ps.*,
      (ps.lifetime_questions >= 100) AS is_eligible
    FROM per_student ps
  ),
  ranked AS (
    SELECT
      w.*,
      CASE WHEN w.is_eligible THEN
        RANK() OVER (PARTITION BY w.grade_level ORDER BY w.last_10_avg DESC NULLS LAST, w.student_id)
      END AS rk,
      COUNT(*) FILTER (WHERE w.is_eligible) OVER (PARTITION BY w.grade_level) AS tot_elig
    FROM with_elig w
  )
  INSERT INTO student_grade_rankings (
    calculated_at,
    grade_level,
    student_id,
    student_name,
    lifetime_questions,
    session_count_in_avg,
    last_10_avg_correct_pct,
    rank_in_grade,
    total_eligible_in_grade
  )
  SELECT
    now(),
    r.grade_level,
    r.student_id,
    r.student_name,
    r.lifetime_questions,
    r.session_count_in_avg,
    r.last_10_avg,
    CASE WHEN r.is_eligible THEN r.rk::integer ELSE NULL END,
    COALESCE(r.tot_elig, 0)
  FROM ranked r;
END;
$$;

CREATE OR REPLACE FUNCTION get_parent_student_grade_rank(p_student_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_row student_grade_rankings%ROWTYPE;
  v_result JSON;
BEGIN
  SELECT * INTO v_row
  FROM student_grade_rankings
  WHERE student_id = p_student_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'has_snapshot', false,
      'error', 'no_ranking_data'
    );
  END IF;

  v_result := json_build_object(
    'has_snapshot', true,
    'calculated_at', v_row.calculated_at,
    'grade_level', v_row.grade_level,
    'student_id', v_row.student_id,
    'student_name', v_row.student_name,
    'lifetime_questions', v_row.lifetime_questions,
    'session_count_in_avg', v_row.session_count_in_avg,
    'last_10_avg_correct_pct', v_row.last_10_avg_correct_pct,
    'rank_in_grade', v_row.rank_in_grade,
    'total_eligible_in_grade', v_row.total_eligible_in_grade,
    'is_eligible', (v_row.lifetime_questions >= 100)
  );
  RETURN v_result;
END;
$$;

-- Grant execute to anon (same as other public RPCs)
GRANT EXECUTE ON FUNCTION recalculate_student_grade_rankings() TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_parent_student_grade_rank(UUID) TO postgres, anon, authenticated, service_role;
