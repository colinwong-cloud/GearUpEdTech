-- Wednesday plan phase 4: DB/query performance hardening
-- Apply in Supabase SQL editor (idempotent).

-- Fast student lookup by parent for quota aggregation.
create index if not exists students_parent_id_idx
  on public.students (parent_id, id);

-- Core index for month-range quota reads by mobile-level student set.
create index if not exists balance_transactions_student_created_at_idx
  on public.balance_transactions (student_id, created_at desc);

-- Narrow index for quota-relevant descriptions used by mobile-summary/mobile-remaining APIs.
create index if not exists balance_transactions_student_created_at_quota_desc_idx
  on public.balance_transactions (student_id, created_at desc, description)
  where description in (
    '管理員手動增加',
    'ADMIN_QUOTA_TOPUP',
    'FREE_TIER_USAGE',
    'ADMIN_QUOTA_USAGE',
    '練習作答扣除',
    'PAID_TIER_USAGE'
  );

-- Expression index for subject-normalized balance lookup in submit/balance RPCs.
create index if not exists student_balances_student_subject_norm_idx
  on public.student_balances (student_id, lower(trim(subject)));

-- Supports sibling/shared-pool fallback deduction path with remaining>0 ordering.
create index if not exists student_balances_subject_remaining_idx
  on public.student_balances (lower(trim(subject)), remaining_questions desc, student_id);

-- Helps parent/session detail joins that filter by session quickly.
create index if not exists session_answers_session_created_at_idx
  on public.session_answers (session_id, created_at desc);
