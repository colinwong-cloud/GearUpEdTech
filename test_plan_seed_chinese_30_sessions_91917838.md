# Test plan: 30 Chinese sessions (91917838 — Loklok & Heihei)

## Goal

For parent mobile **`91917838`**, students **Loklok** and **Heihei** each have **30** completed practice sessions where:

- `quiz_sessions.subject` = **`Chinese`**
- `questions_attempted` = **10**, `score` = **4–9** → **40%–90%** correct rate per session
- `session_answers`: **10** rows per session, first `score` rows **correct**, remainder wrong (aligned with `get_session_detail` / charts)

After seeding, open the parent dashboard → **中文** → confirm **整體正確率趨勢** and **各題型** reflect Chinese-only history (requires app + `get_student_chart_data` SQL with `p_subject` already deployed).

## Preconditions

1. **Supabase** has run `supabase_chart_data_filter_by_subject.sql` (or updated `get_student_chart_data` with `p_subject`) so Math/Chinese charts are not identical.
2. For **each** of Loklok’s and Heihei’s `grade_level`, there are **at least 10** rows in `questions` with `lower(trim(subject)) = 'chinese'`. If not, fix the question bank first, then delete seed rows (`session_token LIKE 'gearup_seed_chinese_30-%'`) and re-run.

## Data load (authoritative)

1. **No DDL** — only `INSERT` into `quiz_sessions` and `session_answers`. Seeded rows use **`session_token`** = `'gearup_seed_chinese_30-' || gen_random_uuid()` (satisfies **UNIQUE** on `session_token`). `session_practice_summary` is set to **NULL**; **`hkt_practice_date`** is left unset (generated column, if present, may fill from trigger or stay null per your DB rules).
2. Your exported schema has **`session_practice_summary`** but **no** `session_practice_summary_parent` on `quiz_sessions` — the seed does not reference the latter.
3. **Supabase → SQL Editor** → paste **`supabase_seed_chinese_30_sessions_91917838.sql`** → Run.
4. Final `SELECT`: **2** students × **30** sessions; **min_pct ≥ 40**, **max_pct ≤ 90**.

## Idempotency

Re-running deletes `session_answers` then `quiz_sessions` where `session_token LIKE 'gearup_seed_chinese_30-%'`, then inserts again.

## Manual UI checks

| # | Step | Expected |
|---|------|----------|
| 1 | Parent login `91917838` → pick **Loklok** → **中文** | Month grid shows many sessions; trend chart populated |
| 2 | Switch **Heihei** → **中文** | Same pattern, independent counts |
| 3 | Open one session **詳情** | 10 answers; correct count matches score |
| 4 | Switch **數學** | Chinese seed sessions do **not** appear |

## CI / agent

- `npm test` / `npm run build` only. No live Supabase from the agent — run the SQL in your SQL Editor.

```sql
DELETE FROM session_answers sa
USING quiz_sessions qs
WHERE sa.session_id = qs.id AND qs.session_token LIKE 'gearup_seed_chinese_30-%';
DELETE FROM quiz_sessions WHERE session_token LIKE 'gearup_seed_chinese_30-%';
```
