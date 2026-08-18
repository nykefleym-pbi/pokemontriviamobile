# Handover — Pokémon Trivia Battle Mobile

Updated 2026-08-18. Read this first in a new session.

## State: Phase 1 complete and pushed

The earlier bootstrap commit was lost — it lived only in a container whose
session could clone `pokemontriviamobile` but never push to it, and the rescue
bundle did not survive either. It has been **re-derived from scratch**, which is
why the history starts fresh. Nothing was lost except the commit itself: the
Supabase schema was already live and durable, and `packages/core` is a
mechanical copy whose correctness is checked rather than trusted.

### Supabase — live, unchanged, nothing to redo

Project `dpmnugfbawebozwihmer` ("Pokemon Trivia Battle Mobile"), `ap-northeast-1`.

| Version | Name |
| --- | --- |
| 20260818013051 | 0001_profiles_and_saves |
| 20260818013118 | 0002_trivia_bank |
| 20260818013137 | 0003_solo_battles |
| 20260818013246 | 0004_tighten_function_grants |
| 20260818013308 | 0005_revoke_public_execute_on_game_rpcs |

Tables `profiles`, `saves`, `curated_questions`, `solo_battles` — all with RLS
enabled, all empty. `curated_questions` being empty is the reason the trivia
bank serves nothing yet.

The files in `supabase/migrations/` were dumped out of
`supabase_migrations.schema_migrations` and match the applied statements
byte-for-byte. They are a record of what ran, not a fresh authoring of it.

Grants were re-verified against `pg_proc` rather than assumed: both game RPCs
now list `authenticated, postgres, service_role` and **not** `anon` or `PUBLIC`,
so migration 0005 did the job 0004 failed to do.

### `packages/core` — 77 files, ported unmodified

The port is mechanical and was verified mechanically:

- The dependency closure of `src/engine/index.ts` in the web repo is **exactly
  73 files**, with **zero bare/package imports** and **zero unresolved
  specifiers**. 4 test files bring it to 77; their only external import is
  `vitest`.
- Every copied file is **byte-identical** to its web-app original (`cmp`, all 77).
- `npx tsc --noEmit` → exit 0. `npx vitest run` → **42 passed**, and no test
  needed editing to get there. (The handover rule stands: if a ported test ever
  needs editing to pass, the port changed behaviour — stop.)

Paths are preserved (`src/engine/`, `src/lib/`, `src/content/`). That is not
cosmetic: `lib/signature-engine-types.ts` and `content/items/item-def.ts` import
*back* into `engine/state`, so engine and its deps are one cycle-containing unit
that only resolves if the relative layout is kept. All imports are relative —
**there are no `@/` aliases in this closure, and none should be added.**

Worth knowing: the barrel `engine/index.ts` deliberately exports only the solo
path. The web app's PvP and Mega modules (`pvp-live-*`, `mega-*`) are *not* in
the closure, which is what keeps this package clean — those are the files that
reach `lib/store` (and so zustand) and the 136 KB signature catalog. If a later
phase needs live PvP, that boundary has to be redrawn deliberately.

### The tsconfig is load-bearing

`packages/core/tsconfig.json` sets `"lib": ["ES2022"]` (no `DOM`) and
`"types": []`. This was **falsified, not assumed** — a probe file referencing
`window`, `localStorage`, `document` and `navigator` produces four `TS2304`/
`TS2584` errors and fails the build. A browser global drifting into the engine
therefore breaks CI instead of crashing on a phone.

Do not copy the web app's `lib: ["ES2022","DOM","DOM.Iterable"]` or
`types: ["vite/client"]` into this package.

## Design decisions worth not re-litigating

**Game logic never goes in SQL.** `grade_trivia_answer` compares an integer and
bumps two counters. The web project's `apply_pvp_live_answer_v2` grew a second
copy of the engine's streak and confusion rules in PL/pgSQL, and a fix shipped in
TypeScript silently did nothing for human players while working for bots. Here
the app and the battle Edge Function both import `packages/core`, so there is no
second implementation to drift.

**The answer key is structurally unreachable.** `curated_questions` has RLS
enabled with *no policies at all*; the only way in is two SECURITY DEFINER
functions that project `correct_index` away. A careless `select *` cannot leak it.

**No PII in `profiles`.** That table has a public read policy, so it holds only
trainer name, sprite, level, xp, Pokédex count and friend code. Email lives in
`auth.users`. When Google sign-in arrives it will carry a name and an avatar —
that is the moment this invariant gets broken by accident.

**Revoke from PUBLIC, not from `anon`.** Postgres grants EXECUTE on every new
function to PUBLIC and `anon` inherits it, so `revoke ... from anon` is a no-op.
0004 made exactly that mistake; 0005 fixes it. Both are kept because the applied
history is the record.

## Deliberately deferred

- **vitest is pinned to `^2`** to match the web app, so the port is provably
  behaviour-identical. Moving to vitest 3 is a separate change — do not do it in
  the same commit as a port.
- **`apps/mobile` does not exist yet.** No Expo app has been created.
- **Data weight** — `lib/pokemon-data.generated.ts` (~196 KB) is value-imported
  by the engine. Fine for CI; revisit when Metro bundle size starts to matter.

## Owner actions outstanding

- Enable **anonymous sign-ins** and the **Email** provider in the Supabase project.
- Configure custom SMTP (Resend free tier) and edit the OTP email template to
  include `{{ .Token }}`.
- Google Play developer account, for the Phase 4 release workflow.

## Not touched

The web app (`nykefleym-pbi/pokemontrivia`) is unmodified — the port only read
from it. Nothing in this repo deploys anywhere yet, so there is no production
build to confirm.
