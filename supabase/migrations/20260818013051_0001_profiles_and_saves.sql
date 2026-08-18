-- Mobile app, fresh schema. Deliberately NOT a copy of the web project's 30
-- tables: this carries only what the first playable build needs, and each later
-- game mode adds its own migration. Columns for modes that do not exist yet
-- (mega, PvP rating, weekly) are omitted rather than nulled out.

-- ---------------------------------------------------------------------------
-- profiles: one row per anonymous auth user.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  trainer_name   text,
  friend_code    text not null unique,
  trainer_sprite text not null default 'red',
  level          int  not null default 1  check (level >= 1),
  xp             int  not null default 0  check (xp >= 0),
  pokedex_count  int  not null default 0  check (pokedex_count >= 0),
  ace_pokemon_id int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A claimed name is unique case-insensitively; unclaimed (null) rows are
  -- exempt, which a plain unique constraint could not express.
  constraint profiles_trainer_name_len check (
    trainer_name is null or char_length(trainer_name) between 3 and 16
  )
);

create unique index profiles_trainer_name_lower_key
  on public.profiles (lower(trainer_name))
  where trainer_name is not null;

-- ---------------------------------------------------------------------------
-- saves: the client's persisted game state, one row per user.
--
-- `state` is the Zustand save payload verbatim. `version` is the client's
-- schema version and is used for last-write-wins conflict resolution, so a
-- stale device cannot clobber a newer save.
-- ---------------------------------------------------------------------------
create table public.saves (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  state      jsonb not null,
  version    int   not null default 1,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger saves_touch_updated_at
  before update on public.saves
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profile bootstrap. The client signs in anonymously and must not have to
-- invent its own friend code, nor be trusted to pick one: collisions and
-- squatting are both server problems. Retry on the (astronomically unlikely)
-- collision rather than failing the user's first launch.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  for i in 1..10 loop
    -- Crockford-ish alphabet: no I, O, 0, 1, so a code read off a screen and
    -- typed by a friend cannot land on the wrong account.
    v_code := (
      select string_agg(
        substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
               (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 6)
    );
    begin
      insert into public.profiles (id, friend_code) values (new.id, v_code);
      return new;
    exception when unique_violation then
      -- try again with a fresh code
    end;
  end loop;
  raise exception 'could not allocate a unique friend code';
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.saves    enable row level security;

-- Profiles are publicly readable: friend lookup and leaderboards both need to
-- see other trainers. Nothing sensitive lives on this table -- no email, no
-- device id -- and that is a constraint to keep as it grows.
create policy profiles_select_all on public.profiles
  for select to anon, authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert policy on purpose: rows come only from the auth trigger above.
-- No delete policy on purpose: account deletion goes through auth.users.

create policy saves_select_own on public.saves
  for select to authenticated using (user_id = (select auth.uid()));

create policy saves_insert_own on public.saves
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy saves_update_own on public.saves
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
