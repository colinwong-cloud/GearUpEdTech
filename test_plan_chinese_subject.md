# Test plan: Chinese subject (`Chinese` in DB)

## Preconditions

- Supabase `questions` include rows with `subject = 'Chinese'` (and grades in use).
- **New registrations:** ensure `register_student` in production includes Math + Chinese grants — re-run `supabase_question_balance_per_answer.sql` (at least the `register_student` block) if you deployed an older version.
- **Existing students:** optionally run once `supabase_backfill_chinese_balance.sql` so every student has a `Chinese` balance row (300) if missing.

## Automated

```bash
npm test
npm run build
```

## Manual — student

| # | Step | Expected |
|---|------|----------|
| 1 | Student login → subject screen | **數學** and **中文** buttons |
| 2 | Tap **中文** | Loads balance for Chinese; question count 10/20/30; subtitle shows **中文** not `Chinese` |
| 3 | Complete 1 Chinese question then exit | Chinese balance decreases by 1 (parent 題目餘額 → 中文) |

## Manual — parent dashboard

| # | Step | Expected |
|---|------|----------|
| 4 | Parent → practice report | **數學** / **中文** tabs switch sessions and charts for that subject |
| 5 | Session card footer | Shows **中文** label for Chinese sessions |

## Manual — account maintenance

| # | Step | Expected |
|---|------|----------|
| 6 | 戶口管理 → 題目餘額 | **數學** / **中文** tabs; total + transactions per subject |

## Regression

- Math flow unchanged (legacy `數學` rows still load if present).
- Email / session summaries still send after practice.
