-- Corrects a claim made in migration 0011.
--
-- 0011 justified withholding `seed` by saying that a player holding cfg and
-- seed could predict crits and status rolls. That was reasoning from the
-- engine's shape rather than from measurement, and measurement disagrees: five
-- different seeds replayed over full winning and losing battles produce
-- byte-identical HP, events and results.
--
-- The reason is that the battle Edge Function pins `abilityId: null` (no
-- server-tracked inventory exists yet), and nearly every RNG-driven effect in
-- this engine hangs off the signature-ability system. With no ability, the RNG
-- decides nothing.
--
-- Withholding the column is still correct - it is defence in depth, it costs
-- the client nothing, and the moment abilities are wired in the original
-- reasoning becomes true. But the comment should not describe an exploit that
-- does not exist today, because the next person to read it will size the risk
-- by what it says.

comment on column public.solo_battles.seed is
  'RNG seed. Withheld from clients as defence in depth. NOTE: measured as of '
  '2026-08-18, the seed has no observable effect on outcomes, because cfg pins '
  'abilityId to null and the RNG only drives ability effects. That changes when '
  'abilities are wired in - see packages/server solo-battle.test.ts.';
