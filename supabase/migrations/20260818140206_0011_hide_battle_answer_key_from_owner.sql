-- Closes a leak that would open the moment the battle Edge Function ships.
--
-- `solo_battles.cfg` is the frozen SoloBattleCfg, and by the engine's design
-- (see engine/solo-battle-config.ts) it embeds the question set INCLUDING
-- `correct` - it is the one place the server holds the answer key for a battle
-- in progress. Meanwhile the only policy on this table is select-own, and
-- Supabase grants column SELECT to `authenticated` by default. Verified before
-- writing this: has_column_privilege('authenticated', ..., 'cfg', 'select') was
-- true.
--
-- So a player could have read the answers to their own live battle with a plain
--
--     select cfg from solo_battles where id = ...
--
-- and no amount of care in the Edge Function would have stopped it. Row-level
-- security cannot express "this row but not that column"; column grants can, so
-- that is what this uses.
--
-- `seed` is withheld for the same reason one step removed: the engine ships
-- inside the app bundle, so a player holding cfg and seed can precompute crits
-- and status rolls before answering. The client never needs either column - the
-- Edge Function returns the events it should render.

revoke select on public.solo_battles from anon, authenticated;

grant select (id, user_id, status, log, result, created_at, updated_at)
  on public.solo_battles to authenticated;

-- Writes were already impossible (RLS with no insert/update/delete policy), but
-- the table-level grants existed and said otherwise. Making the intent explicit
-- costs nothing and means a future policy added for one purpose cannot silently
-- hand out write access as well.
revoke insert, update, delete on public.solo_battles from anon, authenticated;

comment on column public.solo_battles.cfg is
  'Frozen SoloBattleCfg, INCLUDING the answer key. Never grant SELECT on this '
  'column to anon or authenticated - see migration 0011.';

comment on column public.solo_battles.seed is
  'RNG seed. Withheld from clients: with cfg it makes battle rolls predictable.';
