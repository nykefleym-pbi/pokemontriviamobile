# Handover — Pokémon Trivia Battle Mobile

Updated 2026-08-18. Read this first in a new session, then `docs/ROADMAP.md`
for the full phased plan.

## State

- **Phase 1 (`packages/core`) — done, narrower than the plan on purpose.**
  See *Phase 1 boundary* in `docs/ROADMAP.md` for exactly what is in, what is
  out, and why. Do not widen it casually.
- **Phase 2 (Supabase schema) — done.** 7 migrations applied.
- **Phase 3 (`apps/mobile`, the Expo app) — not started. It does not exist.**

The original bootstrap commit was lost — it lived only in a container whose
session could clone `pokemontriviamobile` but never push to it, and the rescue
bundle did not survive either. It was re-derived from scratch, which is why the
history starts fresh. Nothing was lost except the commit: the Supabase schema was
already live, and `packages/core` is a mechanical copy whose correctness is
checked rather than trusted.

## Supabase

Project `dpmnugfbawebozwihmer` ("Pokemon Trivia Battle Mobile"), `ap-northeast-1`.

| Version | Name |
| --- | --- |
| 20260818013051 | 0001_profiles_and_saves |
| 20260818013118 | 0002_trivia_bank |
| 20260818013137 | 0003_solo_battles |
| 20260818013246 | 0004_tighten_function_grants |
| 20260818013308 | 0005_revoke_public_execute_on_game_rpcs |
| 20260818030500 | 0006_daily_questions |
| 20260818031500 | 0007_revoke_anon_execute_on_daily_questions |

Tables `profiles`, `saves`, `curated_questions`, `daily_questions`,
`solo_battles` — all with RLS enabled, all empty. `curated_questions` being empty
is why the trivia bank serves nothing yet.

Files in `supabase/migrations/` match the applied statements byte-for-byte; they
are a record of what ran, not a fresh authoring.

## The rules worth not relearning

### Grants need TWO revokes, not one

This has now been got wrong twice, so it is first.

A new function in Supabase's `public` schema is granted EXECUTE **twice**, by two
independent mechanisms:

1. Postgres grants EXECUTE to the `PUBLIC` pseudo-role on every new function.
   `anon` inherits it.
2. Supabase ships `ALTER DEFAULT PRIVILEGES` that grant EXECUTE **directly** to
   `anon` and `authenticated`.

Revoking either alone leaves the other standing. 0004 revoked `anon` only and did
nothing. 0005 revoked `PUBLIC` only — together they finally closed the game RPCs.
0006 repeated the half-fix on `get_daily_questions` and a probe caught `anon`
still able to call it; 0007 closes it.

The ACL shows the difference plainly — a direct grant is its own entry:

```
get_daily_questions  {postgres=X/postgres,anon=X/postgres,...}   <- leaked
get_trivia_questions {postgres=X/postgres,authenticated=X/...}   <- closed
```

**After adding any SECURITY DEFINER function, assert
`has_function_privilege('anon', '<fn>', 'EXECUTE') = false`.** Reading the
migration is not sufficient; the half-fix looks correct on the page.

### The answer key is structurally unreachable

`curated_questions` and `daily_questions` both have RLS enabled with **no policies
at all**. The only way in is SECURITY DEFINER functions that project
`correct_index` away. A careless `select *` cannot leak it.

`daily_questions` is deliberately **not** a port of the web table of the same
name. That one stores the day's questions as a jsonb blob *including*
`correct_index`, behind a `using (true)` public-read policy, with its picker RPC
granted to `anon`; its own migration header flags the leak and leaves it unfixed.
Here the table stores only the ordered **ids** of `curated_questions` rows, so
there is no second copy of the answer to leak.

### Game logic never goes in SQL

`grade_trivia_answer` compares an integer and bumps two counters. The web
project's `apply_pvp_live_answer_v2` grew a second copy of the engine's streak and
confusion rules in PL/pgSQL, and a fix shipped in TypeScript silently did nothing
for human players while working for bots. Here the app and the battle Edge
Function both import `packages/core`, so there is no second implementation.

### No PII in `profiles`

That table has a public read policy, so it holds only trainer name, sprite, level,
xp, Pokédex count and friend code. Email lives in `auth.users`. When Google
sign-in arrives it will carry a name and an avatar — that is the moment this
invariant gets broken by accident.

## `packages/core`

77 files (73 source + 4 tests), every one **byte-identical** to its web-app
original. `tsc --noEmit` exits 0, `vitest run` reports **42 passed**, and no test
needed editing. If a ported test ever needs editing to pass, the port changed
behaviour — stop.

Paths are preserved (`src/engine/`, `src/lib/`, `src/content/`). That is
load-bearing: `lib/signature-engine-types.ts` and `content/items/item-def.ts`
import *back* into `engine/state`, so engine and deps are one cycle-containing
unit that only resolves if the relative layout survives. Every import is
relative — **no `@/` aliases exist here and none should be added.**

### The tsconfig is load-bearing

`packages/core/tsconfig.json` sets `"lib": ["ES2022"]` (no `DOM`) and
`"types": []`, so `window`, `document`, `localStorage` and `navigator` are
undeclared. Falsified, not assumed: a probe referencing all four produces four
`TS2304`/`TS2584` errors. Do not copy the web app's
`lib: ["ES2022","DOM","DOM.Iterable"]` or `types: ["vite/client"]` in here.

### The eslint boundary rule is the other half

`eslint.config.js` forbids, inside `packages/core/src/**`: React / React Native /
Expo, routers, `@supabase/*`, UI directories, `zustand`, `react-native-mmkv`, any
`**/store` import, and ambient `Math.random` / `Date.now` / `new Date()`.

Ported from the web app's config with one loophole closed: the web version bans
only the aliased `@/lib/store`, so the **relative** form `../lib/store` slipped
past it — which is how two web engine files reach zustand today. The patterns here
match relative paths. Verified by probe: all 8 restrictions fire, including
`./lib/store`.

Two exceptions are registered in that config rather than by editing ported files:
`rollAbilityId` (`lib/abilities.ts`) and `shuffleTriviaOptionsWithOrder`
(`lib/trivia-core.ts`) call `Math.random`. **Neither is reachable from the
engine** — both modules are imported type-only and neither function has a caller
anywhere in the package (verified, not assumed) — so the replay guarantee holds.
Whichever phase first *calls* one of these must give it an `Rng` parameter and
delete the corresponding exception.

## Deliberately deferred

- **`vitest` pinned to `^2`** to match the web app, so the port is provably
  behaviour-identical. Vitest 3 is a separate change — not in the same commit as
  a port.
- **`daily_runs`** — no server-authoritative record of a completed Daily Quest
  run yet. The web app added one because the client self-graded and could claim
  the reward twice. Needed before Daily Quest ships.
- **Data weight** — `lib/pokemon-data.generated.ts` (~196 KB) is value-imported
  by the engine. Fine for CI; revisit when Metro bundle size matters.

## Owner actions outstanding

Supabase dashboard, all blocking sign-in work:

- Enable **anonymous sign-ins** and the **Email** provider.
- Configure custom SMTP (the built-in mailer is a few messages an hour).
- Edit the OTP email template to include `{{ .Token }}` — the default sends
  `{{ .ConfirmationURL }}`, a magic link, which makes an OTP screen impossible to
  complete.

Also: **Google Play developer account** ($25) for Phase 4, and the **upload
keystore** (generated here, stored by the owner as repo secrets, never committed).

## Not touched

The web app (`nykefleym-pbi/pokemontrivia`) is unmodified — the port only read
from it. Nothing in this repo deploys anywhere yet, so there is no production
build to confirm.
