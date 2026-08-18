-- ---------------------------------------------------------------------------
-- solo_battles: one row per solo battle, owned by the server.
--
-- The client may READ its own battles but may never write one. Every mutation
-- goes through the battle Edge Function, which imports the same engine the app
-- renders with (packages/core) and is therefore the only thing that decides
-- damage, rewards or victory. That single-implementation rule is the whole
-- point of the table shape below: `cfg` is what the server decided at start,
-- `log` is what it recorded per turn, `result` is what it paid out.
-- ---------------------------------------------------------------------------
create table public.solo_battles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'active'
             check (status in ('active', 'won', 'lost', 'forfeit', 'expired')),
  seed       text  not null,
  cfg        jsonb not null,
  log        jsonb not null default '[]'::jsonb,
  result     jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A finished battle must say what it paid; an active one must not.
  constraint solo_battles_result_matches_status check (
    (status = 'active' and result is null) or
    (status <> 'active' and result is not null)
  )
);

-- The app's only query: "do I have a battle still going?"
create index solo_battles_active_idx
  on public.solo_battles (user_id, created_at desc)
  where status = 'active';

create trigger solo_battles_touch_updated_at
  before update on public.solo_battles
  for each row execute function public.touch_updated_at();

alter table public.solo_battles enable row level security;

-- Read-only to its owner. No insert, update or delete policy exists, so the
-- anon and authenticated roles cannot write here at all; the Edge Function
-- uses the service-role key, which bypasses RLS.
create policy solo_battles_select_own on public.solo_battles
  for select to authenticated using (user_id = (select auth.uid()));
