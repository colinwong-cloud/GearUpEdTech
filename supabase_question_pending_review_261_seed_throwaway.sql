-- Soft #261 throwaway pending fixtures (pending only — NEVER approve in unattended smoke)
-- Run AFTER supabase_question_pending_review_261.sql and supabase_question_pending_review_261_grants.sql
-- Effect: Inserts batch 261-throwaway-preview and three obvious test stems for list/edit/reject smoke.

BEGIN;

INSERT INTO public.question_generation_batches (
  id,
  batch_key,
  grade_level,
  subject,
  requested_pdf_seed_count,
  requested_ai_seed_count,
  requested_new_question_count,
  actual_pdf_seed_count,
  actual_ai_seed_count,
  type_mix_plan,
  question_key_prefix,
  notes
) VALUES (
  '00000000-0000-4000-8261-000000000001',
  '261-throwaway-preview',
  'P3',
  'Math',
  2,
  2,
  3,
  1,
  1,
  '{"MCQ": 100}'::jsonb,
  'GEN261-TEST-',
  'Soft #261 throwaway — reject in smoke; do not bulk-approve'
)
ON CONFLICT (batch_key) DO NOTHING;

INSERT INTO public.pending_questions (
  id,
  batch_id,
  batch_key,
  question_key,
  review_status,
  subject,
  question_type,
  paper_rank,
  grade_level,
  content,
  opt_a,
  opt_b,
  opt_c,
  opt_d,
  correct_answer,
  explanation,
  language_code
) VALUES
(
  '00000000-0000-4000-8261-000000000101',
  '00000000-0000-4000-8261-000000000001',
  '261-throwaway-preview',
  'GEN261-TEST-THROW-001',
  'pending',
  'Math',
  'MCQ',
  'AI',
  'P3',
  '【測試用・請拒絕】1+1 等於多少？（Soft #261 fixture）',
  '1',
  '2',
  '3',
  '4',
  'B',
  '測試用解釋，請勿批准。',
  'zh-HK'
),
(
  '00000000-0000-4000-8261-000000000102',
  '00000000-0000-4000-8261-000000000001',
  '261-throwaway-preview',
  'GEN261-TEST-THROW-002',
  'pending',
  'Math',
  'MCQ',
  'AI',
  'P3',
  '【測試用・請拒絕】下列哪個是偶數？（Soft #261 fixture）',
  '3',
  '5',
  '8',
  '7',
  'C',
  '測試用解釋，請勿批准。',
  'zh-HK'
),
(
  '00000000-0000-4000-8261-000000000103',
  '00000000-0000-4000-8261-000000000001',
  '261-throwaway-preview',
  'GEN261-TEST-THROW-003',
  'pending',
  'Chinese',
  'MCQ',
  'AI',
  'P3',
  '【測試用・請拒絕】「水」字的部首是？（Soft #261 fixture）',
  '氵',
  '木',
  '火',
  '土',
  'A',
  '測試用解釋，請勿批准。',
  'zh-HK'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;