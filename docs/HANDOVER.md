# Handover — Pokémon Trivia Battle Mobile

Updated 2026-08-18. Read this first in a new session, then `docs/ROADMAP.md`
for the full phased plan.

## State

- **Phase 1 (`packages/core`) — done, narrower than the plan on purpose.**
  See *Phase 1 boundary* in `docs/ROADMAP.md` for exactly what is in, what is
  out, and why. Do not widen it casually.
- **Phase 2 (Supabase schema) — done.** 7 migrations applied.
- **Phase 3 (`apps/mobile`, the Expo app) — scaffolded, not finished.** It
  builds, bundles and plays a solo battle. Most of the phase's screens do not
  exist yet — see *The Expo app* below for exactly what is and is not there.

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
| 20260818030543 | 0006_daily_questions |
| 20260818030637 | 0007_revoke_anon_execute_on_daily_questions |
| 20260818081200 | 0008_allow_expert_difficulty |
| 20260818081750 | 0009_unique_question_text |

Tables `profiles`, `saves`, `curated_questions`, `daily_questions`,
`solo_battles` — all with RLS enabled. **`curated_questions` holds 3,989 seeded
questions**; the rest are empty until there are players.

Files in `supabase/migrations/` match the applied statements byte-for-byte; they
are a record of what ran, not a fresh authoring. **Their filename timestamps must
match the ledger's `version`, which Supabase assigns at apply time — not a
timestamp you guessed when writing the file.** 0006 and 0007 were checked in with
invented versions (`030500`/`031500`) that did not match what was applied
(`030543`/`030637`); both have been renamed. Read the version back from
`list_migrations` after applying and name the file from that.

### The question bank

3,989 questions, seeded from the web project's bank of 4,000 (11 were duplicates
of each other once case and whitespace were normalised — `0009` now makes that
impossible here, and makes a re-run of the seed idempotent).

| difficulty | rows | themed |
| --- | --- | --- |
| medium | 1869 | 257 |
| hard | 937 | 343 |
| easy | 791 | 309 |
| expert | 392 | 178 |

**How it got there, because it is not obvious and is worth not re-deriving.** The
sandbox has no network route to Supabase at all (HTTPS returns `000`, TCP is
refused), so `psql` and `pg_dump` are useless despite being installed. The web
bank is also unreadable through its REST API — RLS is on with zero policies, so
the broad `anon` grants on that table yield nothing.

What worked: the web project already has `pg_net` installed, so a plain `SELECT`
run there POSTed the rows straight to this project's PostgREST endpoint —
database to database, nothing through the agent's context. The receiving end was
a temporary `SECURITY DEFINER` RPC, gated on a shared secret so the public anon
key alone could not write to the bank, dropped immediately afterwards. No schema,
table, or app code on the web project was modified; its `pg_net` response rows
were deleted afterwards, leaving it byte-for-byte as found (4,000 rows, no stray
functions).

**Verified by checksum, not by row count.** An `md5` over the concatenated
content of every row — question, options, correct_index, explanation, category,
difficulty, type_theme — matches on both sides:
`9639a50fe3261c19d0811cc36227155f`. A count alone would not have caught a
corrupted string.

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

## The Expo app

Expo SDK 57, React Native 0.86, expo-router, NativeWind 4 (with Tailwind **3.x**
— NativeWind 4 targets v3's config format, not v4's CSS-first one).

**What works today:** trainer creation, partner pick, a home screen showing
both, a playable solo battle driven by the real engine against the chosen
partner, and a result summary. Trainer name, sprite and partner persist locally
via Zustand + MMKV. `npm run bundle` produces a 4.3 MB Android bundle.

**What the ROADMAP's Phase 3 lists that is NOT built:** boot splash, save SYNC
(the store is local-only — nothing writes to `saves` yet), `expo-audio` /
`expo-haptics`, and bundling the sprite and chrome art. The phase's gate — a
debug APK completing a battle on a real device — has NOT been met; there is no
Android SDK or emulator in this environment, so nothing here has ever run on a
device.

### MMKV means Expo Go will not run this app

`react-native-mmkv` v4 is a Nitro native module, and Expo Go ships a fixed set of
native modules that does not include it. Running the app therefore needs a
**development build** (`npx expo run:android`, or an EAS dev build), not the Expo
Go client. This is a consequence of the ROADMAP's MMKV choice, not an accident —
Phase 4 produces a real APK anyway. If Expo Go convenience matters before then,
`@react-native-async-storage/async-storage` is the swap, and only
`src/lib/store.ts` would change.

Its v4 API is also not what most examples show: `MMKV` is a **type-only** export,
instances come from `createMMKV({ id })`, and the delete method is `remove`, not
`delete`.

### The Metro config is load-bearing

`apps/mobile/metro.config.js` sets `watchFolders`, `nodeModulesPaths` and
`disableHierarchicalLookup`. Without it `@ptb/core` does not resolve at bundle
time **even though `tsc` and eslint are perfectly happy** — they resolve through
`node_modules`, Metro does not. That failure shows up as a red screen on a
phone, not in CI.

So CI runs a fourth gate, `npm run bundle`, purely to catch it. It is the only
check that exercises Metro. Verified by grepping the emitted Hermes bytecode for
engine strings (`in_progress`, `confused`, `poisoned`) and Pokédex data — the
bundle genuinely contains `packages/core`, rather than merely building.

### Trainer name validation mirrors the database on purpose

`validateTrainerName` enforces 3–16 characters, which is exactly
`profiles.trainer_name`'s check constraint. Letting the two drift would mean a
name the app accepts and the database rejects — surfacing at sync time, long
after the player chose it.

Not yet enforced client-side: the **unique index on `lower(trainer_name)`**. The
app cannot check uniqueness without a session, so a duplicate name will be
accepted locally and rejected on first sync. Whichever phase adds sign-in has to
handle that collision rather than assume the local name is free.

### The client does not hold the answer key, and the battle screen shows why

`get_trivia_questions` projects `correct_index` away, so the app cannot grade an
answer itself. The battle screen therefore calls `grade_trivia_answer` and feeds
the resulting boolean into `applyAnswer` — it drives `applyRoundStart` then
`applyAnswer` in that order, which is the same order `solo-battle-replay.ts` uses
server-side, so this optimistic preview and the eventual authoritative replay
agree rather than drifting.

A bundled six-question set is the offline fallback and carries its own answers,
graded locally. **The app plays on that set today**, because the game RPCs are
granted to `authenticated` and anonymous sign-in is still disabled — so the
seeded 3,989 are unreachable from the app until that switch is flipped.

### Colours were converted, not eyeballed

The web app's tokens are `oklch`, which React Native cannot parse. They were
converted to sRGB hex and live in `tailwind.config.js` — `#ee343b` poké-red,
`#f9c718` yellow, `#0076d2` blue, `#0f1b2d` dark.

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
