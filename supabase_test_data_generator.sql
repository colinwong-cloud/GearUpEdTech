-- ============================================================
-- Test Data Generator
-- Run this in Supabase Dashboard > SQL Editor
-- Creates test parent + students + sessions + answers
-- WARNING: This generates ~1M rows. May take several minutes.
-- ============================================================

-- Step 1: Create the test parent
INSERT INTO parents (mobile_number, email, parent_name)
VALUES ('99990001', 'colin.wong@hkedutech.com', 'Test Parent')
ON CONFLICT DO NOTHING;

-- Step 2: Create students (6 per school, one per grade P1-P6)
DO $$
DECLARE
  v_parent_id UUID;
  v_school RECORD;
  v_grade TEXT;
  v_student_name TEXT;
  v_grades TEXT[] := ARRAY['P1','P2','P3','P4','P5','P6'];
BEGIN
  SELECT id INTO v_parent_id FROM parents WHERE mobile_number = '99990001';

  FOR v_school IN SELECT id, COALESCE(name_zh, name_en) AS display_name FROM schools LOOP
    FOREACH v_grade IN ARRAY v_grades LOOP
      v_student_name := 'testing_' || v_school.display_name || '_' || v_grade;

      INSERT INTO students (parent_id, student_name, pin_code, avatar_style, grade_level, school_id)
      VALUES (v_parent_id, v_student_name, '123456', 'Boy', v_grade, v_school.id);
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Students created for parent %', v_parent_id;
END;
$$;

-- Step 3: Create student_balances for all new students
INSERT INTO student_balances (student_id, subject, remaining_questions)
SELECT s.id, '數學', 0
FROM students s
JOIN parents p ON p.id = s.parent_id
WHERE p.mobile_number = '99990001'
AND NOT EXISTS (
  SELECT 1 FROM student_balances sb WHERE sb.student_id = s.id AND sb.subject = '數學'
);

-- Step 4: Create quiz sessions (30 per student, 10 questions each, random scores)
INSERT INTO quiz_sessions (student_id, subject, questions_attempted, score, time_spent_seconds, created_at)
SELECT
  s.id,
  '數學',
  10,
  floor(random() * 11)::int,  -- random score 0-10
  floor(random() * 300 + 30)::int,  -- random time 30-330 seconds
  NOW() - (seq.n || ' hours')::interval  -- spread across recent time
FROM students s
JOIN parents p ON p.id = s.parent_id
CROSS JOIN generate_series(1, 30) AS seq(n)
WHERE p.mobile_number = '99990001';

-- Step 5: Create session answers
-- For each session, pick 10 random questions matching the student's grade level
-- and mark them correct/incorrect based on the session score
INSERT INTO session_answers (session_id, question_id, student_answer, is_correct, question_order, created_at)
SELECT
  qs.id AS session_id,
  q.id AS question_id,
  CASE WHEN rn <= qs.score THEN q.correct_answer ELSE 'X' END AS student_answer,
  rn <= qs.score AS is_correct,
  rn::int AS question_order,
  qs.created_at
FROM quiz_sessions qs
JOIN students s ON s.id = qs.student_id
JOIN parents p ON p.id = s.parent_id
CROSS JOIN LATERAL (
  SELECT q2.id, q2.correct_answer,
    ROW_NUMBER() OVER (ORDER BY random()) AS rn
  FROM questions q2
  WHERE q2.grade_level = s.grade_level
  LIMIT 10
) q
WHERE p.mobile_number = '99990001'
AND NOT EXISTS (
  SELECT 1 FROM session_answers sa WHERE sa.session_id = qs.id
);

-- Step 6: Update quiz session scores to match actual answer counts
UPDATE quiz_sessions qs
SET score = (
  SELECT COUNT(*) FROM session_answers sa
  WHERE sa.session_id = qs.id AND sa.is_correct = true
)
WHERE qs.student_id IN (
  SELECT s.id FROM students s
  JOIN parents p ON p.id = s.parent_id
  WHERE p.mobile_number = '99990001'
);
