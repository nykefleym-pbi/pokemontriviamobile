-- Picks the question set for a Mega raid, answer key included.
--
-- Same role and same rules as `pick_battle_questions` (migration 0013), and
-- the reasoning there applies unchanged: the SERVER picks, because a client
-- that names its own questions is choosing its own difficulty. That is the
-- one thing an id list submitted from a phone cannot be stopped from doing --
-- `get_trivia_questions` is granted to `authenticated` and takes a
-- `_difficulty` argument, so a player could hand back forty `easy` ids and
-- call it a raid.
--
-- DIFFERENCES FROM pick_battle_questions, both deliberate:
--
-- 1. ALL DIFFICULTIES, not easy+medium. This is behaviour-preserving, not a
--    balance decision: the raid screen today calls
--    `get_trivia_questions(40, null, null)`, which filters on nothing, so the
--    mode already draws from the whole bank. Narrowing it here would be a
--    silent difficulty nerf to a boss fight.
--
-- 2. A FLOOR OF 40, not a ceiling of 20. The boss has 400 HP and a correct
--    answer removes 10, so a set shorter than 40 is unwinnable the moment it
--    runs out of questions -- see MEGA_MIN_QUESTIONS in packages/core, which
--    derives that number rather than restating it. The caller still checks how
--    many rows came back; this clamp only stops the argument itself from
--    asking for an impossible run.
--
-- `verified` is filtered here. Note that pick_battle_questions does NOT filter
-- it -- harmless today because all 3,989 rows are verified, but it stops being
-- harmless the first time an unverified row is inserted.
create or replace function public.pick_mega_questions(_count int default 40)
returns setof public.curated_questions
language sql
security definer
set search_path = ''
as $$
  select *
  from public.curated_questions
  where verified
  order by random()
  limit least(greatest(_count, 40), 50);
$$;

comment on function public.pick_mega_questions(int) is
  'Service-role only. Returns curated_questions rows INCLUDING correct_index. '
  'Never grant to anon or authenticated - see migration 0015.';

-- Postgres grants EXECUTE to PUBLIC on every new function, and both anon and
-- authenticated inherit it, so the revoke has to name PUBLIC as well as the
-- two roles. Migrations 0004/0005 were split over exactly this mistake, and
-- here it would publish the answer key over the REST API.
revoke all on function public.pick_mega_questions(int) from public;
revoke all on function public.pick_mega_questions(int) from anon, authenticated;
grant execute on function public.pick_mega_questions(int) to service_role;

-- ---------------------------------------------------------------------------
-- Teach the guest-cleanup job about raids.
--
-- `delete_stale_guest_users` (migration 0010) spares any anonymous user with a
-- save or a solo battle, on the principle that a guest who has PLAYED is never
-- deleted. `mega_runs` did not exist when that was written, so a guest whose
-- only history is a Mega raid reads as an empty shell and would be deleted --
-- taking the raid with it via `on delete cascade`.
--
-- The body is otherwise unchanged from 0010.
-- ---------------------------------------------------------------------------
create or replace function public.delete_stale_guest_users()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with doomed as (
    delete from auth.users u
    where u.is_anonymous
      -- Last activity, not creation: a guest who is playing today on an account
      -- made two months ago is active, and deleting them mid-session would log
      -- them out and orphan the run.
      and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
      and not exists (select 1 from public.saves s where s.user_id = u.id)
      and not exists (select 1 from public.solo_battles b where b.user_id = u.id)
      and not exists (select 1 from public.mega_runs m where m.user_id = u.id)
    returning 1
  )
  select count(*) into v_deleted from doomed;

  return v_deleted;
end;
$$;

comment on function public.delete_stale_guest_users() is
  'Deletes anonymous auth users with no save, no battle and no mega run, '
  'inactive 30+ days. profiles/saves/solo_battles/mega_runs rows follow via '
  'on delete cascade.';

-- `create or replace` resets the ACL to the default, which includes the PUBLIC
-- grant. Re-revoking is not optional here: without it this migration would
-- hand every client a definer-privileged delete button that 0010 took away.
revoke all on function public.delete_stale_guest_users() from public;
revoke all on function public.delete_stale_guest_users() from anon, authenticated;
