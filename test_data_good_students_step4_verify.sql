-- STEP 4: Verify good student data

-- Count entities
SELECT 'students' AS entity, COUNT(*) AS count
FROM students s JOIN parents p ON p.id = s.parent_id WHERE p.mobile_number = '99990002'
UNION ALL
SELECT 'sessions', COUNT(*)
FROM quiz_sessions qs JOIN students s ON s.id = qs.student_id JOIN parents p ON p.id = s.parent_id WHERE p.mobile_number = '99990002'
UNION ALL
SELECT 'answers', COUNT(*)
FROM session_answers sa JOIN quiz_sessions qs ON qs.id = sa.session_id JOIN students s ON s.id = qs.student_id JOIN parents p ON p.id = s.parent_id WHERE p.mobile_number = '99990002';

-- Check overall correct rate
SELECT
  ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 1) AS overall_correct_pct
FROM session_answers sa
JOIN quiz_sessions qs ON qs.id = sa.session_id
JOIN students s ON s.id = qs.student_id
JOIN parents p ON p.id = s.parent_id
WHERE p.mobile_number = '99990002';

-- Check 數與代數 correct rate
SELECT
  q.question_type,
  COUNT(*) AS total,
  SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END) AS correct,
  ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 1) AS correct_pct
FROM session_answers sa
JOIN quiz_sessions qs ON qs.id = sa.session_id
JOIN students s ON s.id = qs.student_id
JOIN parents p ON p.id = s.parent_id
JOIN questions q ON q.id = sa.question_id
WHERE p.mobile_number = '99990002'
AND (q.question_type ILIKE '%代數%' OR q.question_type ILIKE '%algebra%')
GROUP BY q.question_type
ORDER BY correct_pct DESC;

-- Check per-type correct rates (all types)
SELECT
  q.question_type,
  COUNT(*) AS total,
  ROUND(AVG(CASE WHEN sa.is_correct THEN 100.0 ELSE 0.0 END), 1) AS correct_pct
FROM session_answers sa
JOIN quiz_sessions qs ON qs.id = sa.session_id
JOIN students s ON s.id = qs.student_id
JOIN parents p ON p.id = s.parent_id
JOIN questions q ON q.id = sa.question_id
WHERE p.mobile_number = '99990002'
GROUP BY q.question_type
ORDER BY correct_pct DESC
LIMIT 20;
