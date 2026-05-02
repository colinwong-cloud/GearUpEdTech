# Test plan: English subject (`English` in DB)

## Preconditions

- `questions.subject` includes **`English`** (and rows per grade in use).
- **`get_student_chart_data`** accepts **`p_subject`** (run `supabase_chart_data_filter_by_subject.sql` or updated `supabase_charts_feature.sql` if not already).
- **New registrations:** `register_student` grants Math + Chinese + English — re-run `register_student` block in `supabase_question_balance_per_answer.sql` (or full file) in Supabase if needed.
- **Existing students:** optional `supabase_backfill_english_balance.sql`.

## Automated

```bash
npm test
npm run build
```

## Manual — student

| # | Step | Expected |
|---|------|----------|
| 1 | Student login → subject screen | **數學**, **中文**, **英文** |
| 2 | Tap **英文** | Balance for English; 10/20/30; subtitle **英文** |
| 3 | Complete one English question | English balance −1 |

## Manual — parent dashboard (subject separation)

| # | Step | Expected |
|---|------|----------|
| 4 | Parent → **英文** tab | Session grid and trend charts **only** English sessions (`quiz_sessions.subject` / RPC `p_subject`) |
| 5 | Switch to **數學** / **中文** | Different session counts / charts when data exists per subject |
| 6 | **同級排名** block | Text states rank is **for current tab subject**; switching 數學/中文/英文 may show different rank / eligible pool |

## Regression

- Math + Chinese unchanged.
