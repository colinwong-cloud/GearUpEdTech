# Test plan: 30 Chinese sessions (91917838 — Loklok & Heihei)

## Goal

For parent mobile **`91917838`**, students **Loklok** and **Heihei** each have **30** completed practice sessions where:

- `quiz_sessions.subject` = **`Chinese`**
- `questions_attempted` = **10**, `score` = **4–9** → **40%–90%** correct rate per session
- `session_answers`: **10** rows per session, first `score` rows **correct**, remainder wrong (aligned with `get_session_detail` / charts)

After seeding, open the parent dashboard → **中文** → confirm **整體正確率趨勢** and **各題型** reflect Chinese-only history (requires app + `get_student_chart_data` SQL with `p_subject` already deployed).

## Preconditions

1. **Supabase** has run `supabase_chart_data_filter_by_subject.sql` (or updated `get_student_chart_data` with `p_subject`) so Math/Chinese charts are not identical.
2. For **each** of Loklok’s and Heihei’s `grade_level`, there are **at least 10** rows in `questions` with `lower(trim(subject)) = 'chinese'`. If not, the seed SQL will insert sessions with **fewer** answers — fix the question bank first, delete seed (`session_token`), re-run.

## Data load (authoritative)

1. Open **Supabase Dashboard → SQL Editor**.
2. Paste and run the full script:  
   **`supabase_seed_chinese_30_sessions_91917838.sql`**  
   (repo path: same filename at repo root; or Raw from GitHub on your branch.)
3. Check the **final SELECT** in the script output:
   - **2** rows (Loklok, Heihei) if both names matched (`loklok` / `heihei` case-insensitive).
   - **`sessions` = 30** each.
   - **`min_pct` ≥ 40**, **`max_pct` ≤ 90** (per-session; averages will sit in between).

## Idempotency

The script sets `session_token = 'gearup_seed_chinese_30'` on seeded rows. Re-running **deletes** those answers + sessions, then inserts again (new random scores 4–9).

## Manual UI checks

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
WHERE sa.session_id = qs.id AND qs.session_token = 'gearup_seed_chinese_30';
DELETE FROM quiz_sessions WHERE session_token = 'gearup_seed_chinese_30';
```
