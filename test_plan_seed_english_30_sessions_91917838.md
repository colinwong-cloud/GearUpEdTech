# Test plan: 30 English sessions (91917838 — Loklok & Heihei)

## Goal

For parent mobile **`91917838`**, students **Loklok** and **Heihei** each have **30** completed practice sessions where:

- `quiz_sessions.subject` = **`English`**
- `questions_attempted` = **10**, `score` = **2–10** → **20%–100%** correct rate per session
- `session_answers`: **10** rows per session (first `score` correct)

Use this to check **家長 → 英文** performance trending / charts (requires `get_student_chart_data` with `p_subject` and ranking SQL applied if you use rank panel).

## Preconditions

1. For each student’s **`grade_level`**, at least **10** rows in `questions` with `lower(trim(subject)) = 'english'`.
2. **`supabase_grade_ranking_per_subject.sql`** applied if you want **英文** tab rank data after seed; then run `select recalculate_student_grade_rankings();`.

## Data load (you run in Supabase)

1. Open **Supabase → SQL Editor**.
2. Paste and run **`supabase_seed_english_30_sessions_91917838.sql`**  
   Raw: https://raw.githubusercontent.com/colinwong-cloud/GearUpEdTech/cursor/admin-business-kpi-98ae/supabase_seed_english_30_sessions_91917838.sql
3. Check the final `SELECT`: **2** rows (if both students matched), **30** sessions each, **min_pct ≥ 20**, **max_pct ≤ 100**.

## Idempotency

`session_token` prefix **`gearup_seed_english_30-`**. Re-run the script: deletes matching answers + sessions, then inserts fresh random scores.

## Rollback

```sql
DELETE FROM session_answers sa
USING quiz_sessions qs
WHERE sa.session_id = qs.id AND qs.session_token LIKE 'gearup_seed_english_30-%';
DELETE FROM quiz_sessions WHERE session_token LIKE 'gearup_seed_english_30-%';
```

## Manual UI

| # | Step | Expected |
|---|------|----------|
| 1 | Parent `91917838` → **英文** | Many sessions in month view; trend chart has points |
| 2 | **Loklok** vs **Heihei** | Independent counts per child |
| 3 | Session detail | 10 answers; correct count = `score` |

## Agent execution

This environment **cannot** run SQL against your Supabase project. Locally: `npm test` + `npm run build` only.
