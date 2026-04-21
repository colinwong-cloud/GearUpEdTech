-- STEP 4: Verify the data
-- Run this after Step 3 completes

SELECT 'students' AS entity, COUNT(*) AS count
FROM students s JOIN parents p ON p.id = s.parent_id WHERE p.mobile_number = '99990001'
UNION ALL
SELECT 'sessions', COUNT(*)
FROM quiz_sessions qs JOIN students s ON s.id = qs.student_id JOIN parents p ON p.id = s.parent_id WHERE p.mobile_number = '99990001'
UNION ALL
SELECT 'answers', COUNT(*)
FROM session_answers sa JOIN quiz_sessions qs ON qs.id = sa.session_id JOIN students s ON s.id = qs.student_id JOIN parents p ON p.id = s.parent_id WHERE p.mobile_number = '99990001'
UNION ALL
SELECT 'balances', COUNT(*)
FROM student_balances sb JOIN students s ON s.id = sb.student_id JOIN parents p ON p.id = s.parent_id WHERE p.mobile_number = '99990001';
