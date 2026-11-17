# SQL for Colin — Soft #261 (APPLY HOLD)

Do **not** run against production until Colin's own-words apply-yes. Preview UI layout works without SQL; pending RPCs return the setup hint until apply.

| File | One-line effect |
|------|-----------------|
| `supabase_question_pending_review_261.sql` | Creates `pending_questions` + batch tables, admin list/edit/batch-insert/approve/reject RPCs, optional `questions.generation_batch_id`. |
| `supabase_question_pending_review_261_grants.sql` | Locks tables to `service_role`; grants execute on pending admin RPCs. |
| `supabase_question_pending_review_261_seed_throwaway.sql` | Inserts three 【測試用・請拒絕】 pending fixtures (reject in smoke; never unattended approve). |

**Dry-run:** Review each file in Supabase SQL Editor without executing, or run on a non-prod clone first.

**Apply order:** main → grants → (optional) seed throwaway.