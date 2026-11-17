# Grok Bot — pending question batch insert (Soft #261)

**Purpose:** Generation skill inserts **pending only**. Student/tutor practice reads `public.questions` with `source = 'AI'` only; pending rows live in `public.pending_questions` and are never queried by the web app for practice.

## Apply order (Colin apply-yes only — not automated in Dev ticket)

1. `supabase_question_pending_review_261.sql` — tables + RPCs  
2. `supabase_question_pending_review_261_grants.sql` — `service_role` grants  
3. (Optional smoke) `supabase_question_pending_review_261_seed_throwaway.sql` — throwaway pending fixtures  

## How the skill should insert (no browser service-role key)

Use the **existing admin console API** on the server side only (Agent SDK skill, CI job, or local script). Never call Supabase with `SUPABASE_SERVICE_ROLE_KEY` from the browser bundle.

### Endpoint

`POST https://<www-or-preview-host>/api/admin/console`

Headers:

- `Content-Type: application/json`
- `Authorization: Bearer <admin_session_token>` — obtain via the same admin login flow as the console (`POST /api/admin/session` with `ADMIN_CONSOLE_USER` / `ADMIN_CONSOLE_PASS` from the deployment secret store, not from git).

Body:

```json
{
  "action": "pending_batch_insert",
  "payload": {
    "p_batch_key": "GEN261-2026-11-17-math-p3-run1",
    "p_grade_level": "P3",
    "p_subject": "Math",
    "p_requested_pdf_seed_count": 10,
    "p_requested_ai_seed_count": 10,
    "p_requested_new_question_count": 50,
    "p_actual_pdf_seed_count": 8,
    "p_actual_ai_seed_count": 10,
    "p_type_mix_plan": { "MCQ": 100 },
    "p_question_key_prefix": "GEN261-",
    "p_questions": [
      {
        "question_type": "MCQ",
        "content": "……",
        "opt_a": "……",
        "opt_b": "……",
        "opt_c": "……",
        "opt_d": "……",
        "correct_answer": "B",
        "explanation": "……",
        "language_code": "zh-HK",
        "needs_figure": false
      }
    ]
  }
}
```

RPC: `admin_pending_batch_insert` (executed with deployment `SUPABASE_SERVICE_ROLE_KEY` inside `src/app/api/admin/console/route.ts`).

### What the skill must not do

- Do not insert into `public.questions` directly.  
- Do not set `source = 'AI'` on unapproved content.  
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the skill’s client/runtime that ships to browsers.  

### Approval is separate

Colin bulk-approves in **題目管理** (`批准所選題目`). That RPC copies pending → live `questions` and is **live on www immediately** when run against production.

## Throwaway fixtures (after seed SQL)

| Pending id | Stem |
|------------|------|
| `00000000-0000-4000-8261-000000000101` | 【測試用・請拒絕】1+1 等於多少？（Soft #261 fixture） |
| `00000000-0000-4000-8261-000000000102` | 【測試用・請拒絕】下列哪個是偶數？（Soft #261 fixture） |
| `00000000-0000-4000-8261-000000000103` | 【測試用・請拒絕】「水」字的部首是？（Soft #261 fixture） |

Batch key: `261-throwaway-preview`. **Reject** in smoke; do not bulk-approve in unattended runs.