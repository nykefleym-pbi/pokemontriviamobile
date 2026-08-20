-- ---------------------------------------------------------------------------
-- mega_runs: one row per Mega raid run, owned by the server.
--
-- Same shape and same rules as solo_battles (migration 0003): the client may
-- READ its own runs and may never write one, every mutation goes through the
-- mega-run Edge Function, and that function imports the same engine the app
-- renders with. Three things differ, and each is deliberate.
--
-- 1. `question_ids` IS THE QUESTION SET, and it is stored instead of the
--    questions themselves for the same reason migration 0011 had to hide
--    solo_battles.cfg: this table has a select policy for its owner, so an
--    answer key written here would be readable by the player it is being
--    withheld from. Storing ids means there is nothing to hide in the first
--    place -- `curated_questions` stays the only place the key lives.
--
-- 2. `log` ENTRIES CARRY THEIR OWN `correct` FLAG. Mega resolves each answer
--    exactly once, at submit time, and bakes the result into the stored
--    action. packages/core's mega-battle-replay.ts is written around this, so
--    replaying a stored log needs no database access at all, and a question is
--    looked up once no matter how many times the run is replayed afterwards.
--
-- 3. `reward` AND `reward_claimed_at` ARE SEPARATE. The reward is computed by
--    the server when the run ends -- so the amount is never the client's
--    claim -- and `reward_claimed_at` makes collecting it a one-time event.
--    Without that separation, a client that replayed the claim call would be
--    paid twice.
--
--    HONEST LIMIT: the wallet itself is still client-side. Coins, TP and the
--    inventory live in `saves.state`, which the client authors. So this makes
--    the reward AMOUNT and the claim COUNT authoritative -- a player cannot
--    invent a raid clear, inflate the purse, or collect it twice -- while the
--    balance those coins land in remains as trustworthy as the rest of the
--    economy. Moving the wallet server-side is a separate, larger change and
--    is not pretended to be done here.
-- ---------------------------------------------------------------------------
create table public.mega_runs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  status            text not null default 'active'
                    check (status in ('active', 'won', 'lost')),
  question_ids      uuid[] not null,
  log               jsonb not null default '[]'::jsonb,
  result            jsonb,
  reward            jsonb,
  reward_claimed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint mega_runs_questions_nonempty
    check (array_length(question_ids, 1) > 0),

  -- A finished run must say how it ended and what it is worth; an active one
  -- must not. Result and reward are computed together and move together.
  constraint mega_runs_result_matches_status check (
    (status =  'active' and result is null and reward is null) or
    (status <> 'active' and result is not null and reward is not null)
  ),

  -- Nothing can be collected from a run that has not ended.
  constraint mega_runs_claim_needs_end
    check (reward_claimed_at is null or status <> 'active')
);

-- The app's only query: "do I have a raid still going?"
create index mega_runs_active_idx
  on public.mega_runs (user_id, created_at desc)
  where status = 'active';

-- And the one the claim path needs: "what have I finished but not collected?"
create index mega_runs_unclaimed_idx
  on public.mega_runs (user_id, created_at desc)
  where status <> 'active' and reward_claimed_at is null;

create trigger mega_runs_touch_updated_at
  before update on public.mega_runs
  for each row execute function public.touch_updated_at();

alter table public.mega_runs enable row level security;

-- Read-only to its owner. No insert, update or delete policy exists, so the
-- anon and authenticated roles cannot write here at all; the Edge Function
-- uses the service-role key, which bypasses RLS.
create policy mega_runs_select_own on public.mega_runs
  for select to authenticated using (user_id = (select auth.uid()));
