-- Security-advisor follow-up.
--
-- 1. Trigger and event-trigger functions were reachable over PostgREST as
--    /rest/v1/rpc/<name>. They are SECURITY DEFINER, so leaving them callable
--    hands an attacker a definer-privileged entry point for no benefit -- a
--    trigger function is invoked by the trigger, never by a client.
--    `rls_auto_enable` is Supabase's own event trigger that turns RLS on for
--    any new public table; it stays installed, it just stops being an endpoint.
revoke all on function public.handle_new_user()  from anon, authenticated, public;
revoke all on function public.rls_auto_enable()  from anon, authenticated, public;
revoke all on function public.touch_updated_at() from anon, authenticated, public;

-- 2. Every player of this app is signed in -- the client calls
--    signInAnonymously() before anything else, and an anonymous session still
--    carries the `authenticated` role. So `anon` is the pre-session state and
--    needs no game RPCs at all. Dropping it means an unauthenticated caller
--    cannot mine the question bank or drive up the served/correct counters.
revoke execute on function public.get_trivia_questions(int, text, text) from anon;
revoke execute on function public.grade_trivia_answer(uuid, int)        from anon;
