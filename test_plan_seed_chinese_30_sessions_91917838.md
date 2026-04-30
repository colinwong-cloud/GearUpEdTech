# Test plan: 30 Chinese sessions (91917838 — Loklok & Heihei)

## Goal

For parent mobile **`91917838`**, students **Loklok** and **Heihei** each have **30** completed practice sessions where:

- `quiz_sessions.subject` = **`Chinese`**
- `questions_attempted` = **10**, `score` = **4–9** → **40%–90%** correct rate per session
- `session_answers`: **10** rows per session, first `score` rows **correct**, remainder wrong (aligned with `get_session_detail` / charts)

After seeding, open the parent dashboard → **中文** → confirm **整體正確率趨勢** and **各題型** reflect Chinese-only history (requires app + `get_student_chart_data` SQL with `p_subject` already deployed).

## Preconditions

1. **Supabase** has run `supabase_chart_data_filter_by_subject.sql` (or updated `get_student_chart_data` with `p_subject`) so Math/Chinese charts are not identical.
2. For **each** of Loklok’s and Heihei’s `grade_level`, there are **at least 10** rows in `questions` with `lower(trim(subject)) = 'chinese'`. If not, the seed SQL will insert sessions with **fewer** answers — fix the question bank first, delete seed (marker in `session_practice_summary`), re-run.

## Data load (authoritative)

1. **No new tables or DDL** in the seed script — it only `INSERT`s into existing `quiz_sessions` and `session_answers`.
2. The script tags seeded rows with `session_practice_summary = '__SEED__:gearup_chinese_30__'` so re-runs delete the same rows first. That column must already exist (from **`supabase_session_practice_summary.sql`** — not part of this seed). If `INSERT` fails with “column does not exist”, run that migration once.
3. Open **Supabase Dashboard → SQL Editor**, paste **`supabase_seed_chinese_30_sessions_91917838.sql`**, Run.
4. Check the **final SELECT** in the script output (2 students × 30 sessions; min/max % in 40–90 range).

## Idempotency

Re-running deletes all rows where `session_practice_summary = '__SEED__:gearup_chinese_30__'` (and their `session_answers`), then inserts fresh random scores.

**Note:** This marker appears in `session_practice_summary`; it is **not** a real student-facing summary. Safe for synthetic test data only.

## Automated execution in this repo

- `npm test` / `npm run build` only.  
- **This agent is not connected to your Supabase project** — we cannot read or modify your live schema. Schema conclusions below come from **this repository’s SQL files**, not a live DB connection.

| # | Step | Expected |
|---|------|----------|
| 1 | Parent login `91917838` → pick **Loklok** → **中文** | Month grid shows many sessions; trend chart populated |
| 2 | Switch **Heihei** → **中文** | Same pattern, independent counts |
| 3 | Open one session **詳情** | 10 answers; correct count matches score |
| 4 | Switch **數學** | Chinese seed sessions do **not** appear |

## Automated execution in this repo

- `npm test` / `npm run build` (CI only).  
- **No** live Supabase execution from the agent environment — you must run the SQL file in your project SQL Editor.

## Rollback

```sql
DELETE FROM session_answers sa
USING quiz_sessions qs
WHERE sa.session_id = qs.id AND qs.session_practice_summary = '__SEED__:gearup_chinese_30__';
DELETE FROM quiz_sessions WHERE session_practice_summary = '__SEED__:gearup_chinese_30__';
```
