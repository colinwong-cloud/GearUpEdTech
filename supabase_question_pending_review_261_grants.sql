-- Soft #261 — service_role grants for pending review RPCs (run after supabase_question_pending_review_261.sql)

BEGIN;

REVOKE ALL ON TABLE public.question_generation_batches FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.pending_questions FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.admin_list_pending_questions(text, text, text, text, integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_pending_question(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_pending_question(uuid, text, text, text, text, text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_pending_batch_insert(text, text, text, integer, integer, integer, integer, integer, jsonb, text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_approve_pending_questions(uuid[]) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_reject_pending_questions(uuid[]) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_list_pending_questions(text, text, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_pending_question(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_pending_question(uuid, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_pending_batch_insert(text, text, text, integer, integer, integer, integer, integer, jsonb, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_bulk_approve_pending_questions(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_bulk_reject_pending_questions(uuid[]) TO service_role;

COMMIT;