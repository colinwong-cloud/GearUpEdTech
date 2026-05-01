-- ============================================================
-- RLS Policies for the GearUp Quiz app
-- Run this in Supabase Dashboard > SQL Editor
--
-- Strategy:
-- - Enable RLS on ALL tables
-- - Only allow SELECT on tables the frontend reads directly
-- - All writes go through SECURITY DEFINER RPC functions
--   (which bypass RLS), so no INSERT/UPDATE/DELETE policies needed
-- ============================================================

-- 1. parents — no direct access needed (login via RPC)
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
-- No policies = fully locked for anon

-- 2. students — no direct access needed (login via RPC)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
-- No policies = fully locked for anon

-- 3. questions — anon needs SELECT to fetch quiz questions
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_questions" ON questions;
CREATE POLICY "anon_select_questions" ON questions
  FOR SELECT TO anon USING (true);

-- 4. quiz_sessions — no direct access needed (all via RPC)
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
-- No policies = fully locked for anon

-- 5. session_answers — no direct access needed (all via RPC)
ALTER TABLE session_answers ENABLE ROW LEVEL SECURITY;
-- No policies = fully locked for anon

-- 6. student_balances — anon needs SELECT to check balance before quiz
ALTER TABLE student_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_student_balances" ON student_balances;
CREATE POLICY "anon_select_student_balances" ON student_balances
  FOR SELECT TO anon USING (true);

-- 7. student_rank_performance — no direct access needed (all via RPC)
ALTER TABLE student_rank_performance ENABLE ROW LEVEL SECURITY;
-- No policies = fully locked for anon

-- 8. parent_weights — anon needs SELECT to read weight config
ALTER TABLE parent_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_parent_weights" ON parent_weights;
CREATE POLICY "anon_select_parent_weights" ON parent_weights
  FOR SELECT TO anon USING (true);

-- 9. past_papers — no direct access needed
ALTER TABLE past_papers ENABLE ROW LEVEL SECURITY;
-- No policies = fully locked for anon

-- 10. question_reports — already has RLS enabled, ensure no extra access
ALTER TABLE question_reports ENABLE ROW LEVEL SECURITY;
-- No policies = fully locked for anon (writes via RPC)
