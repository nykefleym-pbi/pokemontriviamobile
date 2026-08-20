-- Picks the question set for a solo battle, answer key included.
--
-- This is the ONE function in the schema that returns `correct_index`, and it
-- is callable only by `service_role` - i.e. only from the battle Edge Function,
-- which embeds the answers in `solo_battles.cfg` (a column no client can read,
-- see migration 0011) and reveals each one only after the player has committed
-- to a choice.
--
-- It exists because PostgREST cannot express `order by random()`, and doing the
-- selection client-side would mean shipping the candidate rows - answers and
-- all - to the thing that is supposed to be guessing.
--
-- Difficulty mix is deliberate and fixed here rather than passed in: a client
-- that could ask for six `easy` questions would be choosing its own difficulty.

create or replace function public.pick_battle_questions(_count int default 6)
returns setof public.curated_questions
language sql
security definer
set search_path = ''
as $$
  select *
  from public.curated_questions
  where difficulty in ('easy', 'medium')
  order by random()
  limit greatest(1, least(_count, 20));
$$;

comment on function public.pick_battle_questions(int) is
  'Service-role only. Returns curated_questions rows INCLUDING correct_index. '
  'Never grant to anon or authenticated - see migration 0013.';

-- Postgres grants EXECUTE to PUBLIC on every new function, and both anon and
-- authenticated inherit it. Revoking from those two roles alone would be a
-- no-op; the revoke has to name PUBLIC. This is the same mistake migrations
-- 0004 and 0005 were split over, and it is the whole ballgame here: leaving it
-- would publish the answer key over the REST API.
revoke all on function public.pick_battle_questions(int) from public;
revoke all on function public.pick_battle_questions(int) from anon, authenticated;
grant execute on function public.pick_battle_questions(int) to service_role;
