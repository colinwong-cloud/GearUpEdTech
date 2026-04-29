# Test plan: question balance (per answer, shared parent pool)

## Preconditions

1. Run **`supabase_question_balance_per_answer.sql`** in Supabase SQL Editor (merges duplicate Math/數學 rows per student, updates RPCs, adds unique index on `session_answers`).
2. Deploy the app revision that **refreshes balance after each answer** and **does not** call `deduct_student_balance` at session end.

## Automated (local)

- `npm test`
- `npm run build`

## Manual — student flow

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Check before session | Login as student with balance ≥ 10; choose subject | Question count screen shows **目前餘額**; 10/20/30 disabled if balance < count |
| 2 | Insufficient for chosen count | Balance 5; pick 10 | Error: 餘額不足… |
| 3 | Per-question deduction | Start 10-question session; answer 5 questions; **force quit** (close tab) or navigate away without finishing | Reload / login: **family total** balance decreased by **5** (check parent 題目餘額 or DB `balance_transactions` with description `練習作答扣除`) |
| 4 | Mid-session block | Two-step: reduce balance server-side so after N answers pool is 0; try next answer | Error **餘額不足，無法提交此題**; no duplicate `session_answers` for same `question_order` (unique index) |
| 5 | Complete session | Finish all 10 | Balance −10 vs start; **no** extra batch of 10 from old `deduct_student_balance` at end (only per-answer rows) |

## Manual — parent shared pool

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 6 | Shared balance | Parent with two students A and B; note **sum** of both `student_balances` for Math | Student A uses 3 questions; parent view shows **total** decreased by 3; transactions show **學生名** of who practiced |
| 7 | Second child registration | Register second student on same parent mobile | **No** second +300 signup row if first child already has Math balance (one pool per parent) |

## Manual — transaction history (empty list fix)

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 8 | Math vs 數學 | Parent 題目餘額; pick current month after practice | Rows appear for `練習作答扣除`; legacy `數學` transactions visible when filtering as **Math** |

## Regression

- Admin **手動增加** still updates balance + logs transaction.
- Email after session still sends (session completes normally).

## Review notes (implementation)

- **Authoritative deduction:** inside `submit_answer` (after balance check), one row in `student_balances` is decremented; `balance_after` on the transaction row is **sum of all siblings’** Math (and legacy 數學) rows.
- **Idempotency:** unique index `(session_id, question_order)` prevents double charge if the client retries the same submit.
