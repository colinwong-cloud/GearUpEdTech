-- STEP 1: Create parent + all students + balances
-- Run this first in Supabase SQL Editor

-- Create parent
INSERT INTO parents (mobile_number, email, parent_name)
VALUES ('99990001', 'colin.wong@hkedutech.com', 'Test Parent')
ON CONFLICT DO NOTHING;

-- Create 6 students per school (P1-P6)
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
END;
$$;

-- Create balances (0 remaining since these are test accounts)
INSERT INTO student_balances (student_id, subject, remaining_questions)
SELECT s.id, '數學', 0
FROM students s
JOIN parents p ON p.id = s.parent_id
WHERE p.mobile_number = '99990001'
AND NOT EXISTS (
  SELECT 1 FROM student_balances sb WHERE sb.student_id = s.id AND sb.subject = '數學'
);
