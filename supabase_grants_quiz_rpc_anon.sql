-- Grant anon access to quiz + login RPCs (required when RLS blocks direct writes).
-- Run in Supabase SQL Editor after `supabase_rpc_functions.sql`.

GRANT EXECUTE ON FUNCTION login_by_mobile(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION create_quiz_session(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_answer(UUID, UUID, TEXT, BOOLEAN, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION update_quiz_session(UUID, INTEGER, INTEGER, INTEGER) TO anon;
