-- 0004 revoked EXECUTE from `anon`, which changed nothing: Postgres grants
-- EXECUTE on every new function to the PUBLIC pseudo-role, and `anon` inherits
-- it. Revoking from `anon` while PUBLIC still holds the grant is a no-op, and
-- the advisor correctly kept reporting both functions as anon-callable.
--
-- Revoke from PUBLIC first, then hand EXECUTE back to `authenticated` only.
revoke execute on function public.get_trivia_questions(int, text, text) from public;
revoke execute on function public.grade_trivia_answer(uuid, int)        from public;

grant execute on function public.get_trivia_questions(int, text, text) to authenticated;
grant execute on function public.grade_trivia_answer(uuid, int)        to authenticated;
