-- Guest cleanup, added alongside email sign-in.
--
-- Anonymous users accumulate forever: one row per install, and another per
-- reinstall, none of which the player can ever get back to. Left alone,
-- `auth.users` becomes mostly rows for people who opened the app once.
--
-- Deliberately conservative: a guest who has PLAYED (has a save or a battle) is
-- never touched, no matter how old. Only empty shells go. Deleting a guest who
-- still had progress would be unrecoverable, and there is no undo, so the job
-- errs entirely in one direction.
--
-- ---------------------------------------------------------------------------
-- Restating an invariant this change makes newly temptable:
--
--   `profiles` still holds NO personally identifying data. Not email, not a
--   device id, not a display name from a provider. It has a `using (true)`
--   read policy - every row is readable by every player - so anything put here
--   is published. Email lives in `auth.users`, which is not exposed via
--   PostgREST at all.
--
-- This matters more from here on, not less. The next provider (Google) hands
-- back a real name and an avatar URL, and copying them into `profiles`
-- "because they're already public on Google" is exactly the mistake this note
-- exists to stop.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

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
    returning 1
  )
  select count(*) into v_deleted from doomed;

  return v_deleted;
end;
$$;

comment on function public.delete_stale_guest_users() is
  'Deletes anonymous auth users with no save and no battle, inactive 30+ days. '
  'profiles/saves/solo_battles rows follow via on delete cascade.';

-- Nobody but the scheduler runs this. `security definer` plus a client-callable
-- grant would be a delete button reachable from a phone; the revoke from PUBLIC
-- is the one that actually does the work, because Postgres grants EXECUTE to
-- PUBLIC on every new function and `anon` inherits it. Revoking from `anon`
-- alone is a no-op -- a mistake already made once here, in migration 0004.
revoke all on function public.delete_stale_guest_users() from public;
revoke all on function public.delete_stale_guest_users() from anon, authenticated;

select cron.schedule(
  'delete-stale-guest-users',
  '17 3 * * *',
  $job$select public.delete_stale_guest_users()$job$
);
