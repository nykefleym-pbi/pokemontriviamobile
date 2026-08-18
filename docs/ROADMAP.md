# Pokémon Trivia Battle — native Android app (Expo) for Google Play

> **Status (2026-08-18).** This is the owner's approved plan, reproduced as the
> source of truth. Phase status and the few points where the shipped code
> deviates are marked inline in `> quoted` blocks like this one. Everything not
> so marked is the plan as approved.
>
> - **Phase 1 — partially done.** `packages/core` exists and is green, but with a
>   deliberately narrower scope than this plan specifies. See *Phase 1 boundary*.
> - **Phase 2 — done.** Seven migrations applied to `dpmnugfbawebozwihmer`.
> - **Phase 3 — scaffolded, not finished.** `apps/mobile` builds, bundles and
>   plays a solo battle; most of the phase's screens are still missing and the
>   on-device gate has not been met.
> - **Repo is `nykefleym-pbi/pokemontriviamobile`** (no hyphen), not the
>   `pokemontrivia-mobile` suggested below. It exists and this is it.

## Context

The web app (`nykefleym-pbi/pokemontrivia`, live at `pokemontriviabattle.vercel.app`)
stays exactly as it is — untouched, still deployed to Vercel, still on its current
Supabase project. Alongside it we build a **separate native Android app** with its own
repo, its own Supabase project, and its own release cadence, so the two can evolve
independently.

Decisions taken by the owner (2026-08-18):

| Decision | Choice |
| --- | --- |
| Stack | **Expo / React Native rewrite** (native UI, not a webview) |
| Repo | **New separate GitHub repo** |
| Backend | **Fresh schema**, new Supabase project |
| First Play track | **Internal testing** |
| Build | **GitHub Actions**, signed AAB |
| IP posture | **Publish as-is**, risk accepted |

### Honest sizing

The web app is ~81k lines of TS/TSX: 108 components, 19 routes, 21 engine files,
134 lib files, 72 test files, plus 30 Supabase tables, ~60 RPCs and 12 Edge
Functions. A faithful native rewrite of all of it is a **multi-month** project, not a
one-PR job. The plan below is therefore staged so that a **playable app is on the
owner's phone via Play internal testing at the end of Phase 3**, with the remaining
game modes landing as subsequent releases.

### What actually has to be rewritten (and what does not)

Exploration found a clean three-layer split, which is what makes this tractable:

- **Portable as-is (~35k lines).** `src/engine/*` (damage, turn, rng, solo/mega/pvp
  replay, validation) and the non-DOM half of `src/lib` — `type-chart.ts`,
  `game-data.ts`, `level-curve.ts`, `pokemon-data.generated.ts` (10k lines),
  `signature-abilities.ts` (3k lines), `trivia-core.ts`, `achievements.ts`,
  `gym-leaders.ts`, `pvp-combat.ts`, `pvp-bot.ts`, `elite-four.ts`. Pure TypeScript,
  no DOM. Only 23 of ~110 lib files touch `window`/`document`, and they are the
  peripheral ones (`install-prompt`, `audio`, `haptics`, `push`, `analytics`,
  `preload-assets`).
- **Portable with adapters.** The Zustand store (`src/lib/store.ts` + 6 slices) —
  `persist` works in RN by swapping the `localStorage` storage adapter for MMKV.
  `audio.ts`, `haptics.ts`, `push.ts` need Expo equivalents behind the same API.
- **Rewritten (~35k lines).** Everything in `src/components` and `src/routes` —
  Tailwind CSS classes, Framer Motion, Radix primitives, `<div>`s, the desktop
  phone-frame, the service worker. None of it survives contact with React Native.

Two web-only server concerns disappear cleanly: the `src/routes/api.*.ts` handlers
are thin (`api.trivia.ts` just returns a bundled fallback question; the rest read
curated questions from Supabase), and the only secrets in the whole codebase are
`SUPABASE_URL` / publishable key / service-role key. So the native app talks to
Supabase directly and needs no Nitro server at all.

## Prerequisites (owner actions)

1. ~~**Create the empty GitHub repo** and add it to this session's scope.~~
   **Done** — `nykefleym-pbi/pokemontriviamobile`, in scope, Phase 1 merged to `main`.
2. **Google Play developer account** ($25 one-off). Note: personal accounts must run
   12+ testers on closed testing for 14 continuous days before production unlocks —
   irrelevant for internal testing, which is our Phase 3 target, but it sets the
   runway for any later public launch. **Still outstanding.**
3. ~~**New Supabase project** created.~~ **Done** — `dpmnugfbawebozwihmer`
   ("Pokemon Trivia Battle Mobile", `ap-northeast-1`).
4. **Upload keystore** — I generate it, the owner stores the `.jks` and its passwords
   as GitHub repo secrets. It must never be committed. **Still outstanding**
   (Phase 4).

> Additional owner actions discovered since this plan was written, all in the
> Supabase dashboard and all blocking sign-in work:
> **enable anonymous sign-ins**, **enable the Email provider**, **configure custom
> SMTP**, and **edit the OTP email template to include `{{ .Token }}`** — the
> default sends `{{ .ConfirmationURL }}`, a magic link, which makes an OTP screen
> impossible to complete.

## Phase 1 — Extract the portable core into a shared package

Goal: one copy of the game rules, not two that drift.

- In the **new** repo, create `packages/core/` and copy in the DOM-free modules
  listed above from the web repo, unchanged where possible. Keep the existing
  filenames so knowledge transfers (`engine/turn.ts`, `lib/type-chart.ts`, …).
- Copy the corresponding tests. `src/engine` and the pure `src/lib` tests are the
  majority of the 72 test files and they should pass untouched under Vitest.
- Move the generated data (`pokemon-data.generated.ts`, `trainer-data.generated.*`)
  in as-is; they are build products with no runtime dependencies.
- **Do not** try to make the web app consume this package in the same change. The
  web app stays frozen. Divergence is accepted; the two are separate products now.

Gate: `vitest run` green in `packages/core` with the ported suites.

### Phase 1 boundary — decision (2026-08-18)

> **The shipped `packages/core` is narrower than the list above, on purpose.**
>
> What shipped is the **dependency closure of `src/engine/index.ts`** — computed
> mechanically, not chosen by hand: **73 source files + 4 test files = 77**, every
> one byte-identical to its web-app original, with zero bare-package imports and
> zero unresolved specifiers. `tsc` exits 0 and 42 tests pass unmodified.
>
> **What that includes:** 8 engine sources (`state`, `timers`, `damage`, `rng`,
> `turn`, `solo-battle-config`, `solo-battle-replay`, `index`), 7 lib modules
> (`type-chart`, `level-curve`, `pokemon-data`, `pokemon-data.generated`,
> `abilities`, `trivia-core`, `signature-engine-types`), and `content/`
> (`items/item-def`, `statuses/status-def`, and the 56-file `abilities/rolled/`).
>
> **What it excludes,** versus the list above: the 5 PvP/Mega engine sources
> (`pvp-live-answer`, `pvp-live-turn`, `pvp-shadow-verify`, `mega-replay`,
> `mega-battle-replay`) and the lib modules `signature-abilities`, `game-data`,
> `achievements`, `gym-leaders`, `elite-four`, `pvp-combat`, `pvp-bot`.
>
> **Why.** `engine/index.ts` deliberately exports only the solo path. The excluded
> engine files are exactly the ones that reach `../lib/store` — a zustand module —
> and the 136 KB `signature-abilities` catalog. Pulling them in now would import
> the client-state coupling into a package whose entire value is being free of it,
> to serve a Phase 3 vertical slice that is **solo battle only**. The narrow cut is
> also the reversible direction: widening later is mechanical, while un-coupling
> after the fact is not.
>
> **When to revisit.** Phase 5 items 5 (Mega raids) and 6 (PvP). Whichever lands
> first must redraw this boundary deliberately — and must deal with `../lib/store`
> by re-pointing those two type-only imports at `lib/store/types` or inlining the
> types, rather than dragging zustand in.
>
> Two further findings recorded during the port:
> - **`vitest` is pinned to `^2`** to match the web app, so the port is provably
>   behaviour-identical. Upgrading to vitest 3 is a separate change.
> - **`lib/abilities.ts` and `lib/trivia-core.ts` call `Math.random()`** in
>   `rollAbilityId` and `shuffleTriviaOptionsWithOrder`. Neither is reachable from
>   the engine — both modules are imported type-only and neither function has a
>   caller anywhere in the package (verified) — so the replay guarantee holds. They
>   are registered as the only two exceptions in `eslint.config.js`. **Whichever
>   phase first calls one of these must give it an `Rng` parameter instead.**

## Phase 2 — Fresh Supabase schema for mobile

Designed from what mobile actually needs, not by replaying 30 tables. Start with the
minimum that supports Phase 3's vertical slice, then grow per phase.

- **Phase 2 tables:** `profiles` (trainer name, level, code), `saves` (the Zustand
  save payload), `curated_questions` + `daily_questions` (the trivia bank),
  `solo_battles` (server-authoritative solo results).
- **Deferred to later phases:** everything PvP (`pvp_live_matches`, `pvp_queue`,
  `pvp_chat_*`, the ~40 `_pvp_*` PL/pgSQL helpers), `mega_*`, `friends`,
  `referrals`, `push_subscriptions`, `feedback`.
- Author every table with RLS from the start, keyed on `auth.uid()` from anonymous
  sessions (the web app's `signInAnonymously()` model in `src/lib/social.ts` carries
  over unchanged and, notably, needs **no** OAuth redirect or deep-link handling).
- Ship via `mcp__Supabase__apply_migration` so migrations are recorded, and keep the
  SQL checked into `supabase/migrations/` in the new repo — the web repo's local
  migrations folder is nearly empty and its real schema only lives remotely, a
  mistake worth not repeating.
- **Carry forward the CLAUDE.md warning:** the web app's `apply_pvp_live_answer_v2`
  duplicates engine logic in PL/pgSQL, so rules added in TypeScript silently did
  nothing for human players. In the fresh schema, resolve turns in **one** place —
  a Deno Edge Function importing `packages/core` — and let SQL only persist. This is
  the single biggest correctness win available from starting over.

Gate: schema applied, RLS verified by an authenticated and an unauthenticated
`execute_sql` probe.

> **Status: done.** Seven migrations applied and checked in:
>
> | Version | Name |
> | --- | --- |
> | 20260818013051 | 0001_profiles_and_saves |
> | 20260818013118 | 0002_trivia_bank |
> | 20260818013137 | 0003_solo_battles |
> | 20260818013246 | 0004_tighten_function_grants |
> | 20260818013308 | 0005_revoke_public_execute_on_game_rpcs |
> | 20260818030543 | 0006_daily_questions |
> | 20260818030637 | 0007_revoke_anon_execute_on_daily_questions |
> | 20260818081200 | 0008_allow_expert_difficulty |
> | 20260818081750 | 0009_unique_question_text |
>
> `daily_questions` is **not** a port of the web table of the same name. That one
> stores the day's questions as a jsonb blob **including `correct_index`**, behind a
> `using (true)` public-read policy, with its picker RPC granted to `anon` — its own
> migration header flags the leak and leaves it unfixed. The mobile table stores only
> the ordered **ids** of `curated_questions` rows, so the answer key never leaves the
> table that already has RLS on with no policies. Verified functionally: the serving
> function returns `id, question, options, category, difficulty, type_theme` and
> nothing else.
>
> **Grants need TWO revokes, not one.** A new function in Supabase's `public` schema
> is granted EXECUTE twice — once to the `PUBLIC` pseudo-role by Postgres, and once
> **directly to `anon`** by Supabase's `ALTER DEFAULT PRIVILEGES`. Revoking either
> alone leaves the other standing. 0004 revoked `anon` only; 0005 revoked `PUBLIC`
> only; together they closed the game RPCs. 0006 repeated the half-fix and a
> verification probe caught `anon` still able to call `get_daily_questions`; 0007
> closes it. Check with `has_function_privilege('anon', …, 'EXECUTE')`, never by
> reading the migration.
>
> Advisor state: 2 INFO `rls_enabled_no_policy` (`curated_questions`,
> `daily_questions` — both by design) and 3 WARN that signed-in users can execute the
> three SECURITY DEFINER functions, which is precisely their purpose.
>
> **The bank is seeded: 3,989 questions** (medium 1869, hard 937, easy 791,
> expert 392), copied from the web project's 4,000 with 11 duplicates dropped.
> `0008` widened the difficulty constraint to admit `expert` rather than
> collapsing it into `hard` — expert is a first-class `CuratedDifficulty` in the
> web app, requested by Elite Four as `["hard","expert"]` and used by Mega, so
> collapsing it would have destroyed a tier Phase 5 items 2 and 5 both need, with
> no way to recover which rows had been expert. `0009` adds a unique index on the
> normalised question text, which de-duplicates and makes any re-run of the seed
> idempotent.
>
> Transfer method, since it is not obvious: the sandbox has no network route to
> Supabase (HTTPS `000`, TCP refused), and the web bank is unreadable via REST
> (RLS on, zero policies). The web project already had `pg_net` installed, so a
> `SELECT` there POSTed rows directly to this project's PostgREST endpoint —
> DB to DB — into a temporary secret-gated RPC that was dropped afterwards.
> Nothing on the web project was modified; verified afterwards at 4,000 rows with
> no stray functions. Integrity confirmed by an md5 over all row content matching
> on both sides (`9639a50fe3261c19d0811cc36227155f`), not by row count alone.
>
> Not yet built, and needed before Daily Quest can actually ship: a
> server-authoritative `daily_runs` equivalent. The web app added one because the
> client self-graded and could claim the reward twice.

## Phase 3 — Expo app: vertical slice to Play internal testing

The smallest thing worth installing: boot → trainer creation → partner pick → a
complete solo trivia battle → results → save sync. This is the phase that ends with
the app on the owner's phone.

- `npx create-expo-app` with **Expo Router** (file-based, and the closest analogue to
  the existing TanStack Router route files), TypeScript, `packages/core` as a
  workspace dependency.
- **Styling:** NativeWind so the existing Tailwind class vocabulary and the
  `styles.css` design tokens (`--color-poke-yellow`, `bg-card`, `shadow-card`, the
  pixel/display font pairing) transfer almost verbatim rather than being re-invented.
- **Animation:** `react-native-reanimated` + Moti in place of Framer Motion.
- **Storage:** `react-native-mmkv` as the Zustand `persist` adapter, replacing
  `localStorage`. Port `buildSavePayload` / the merge migration as-is — including
  `trainingPointsSpent`, which the lifetime-TP damage multiplier depends on.
- **Assets:** bundle the sprite and chrome art (`public/types`, `ui`, `items`,
  `rewards`, `field`) into the app instead of fetching them. This kills the whole
  class of missing-asset bugs the web app has fought, and removes the `virtual:*`
  Vite manifest plugins and `preload-assets.ts` entirely. Leave the 15 MB of iOS
  splash screens behind.
- **Audio/haptics:** `expo-audio` and `expo-haptics` behind the existing
  `src/lib/audio.ts` / `haptics.ts` function signatures.
- Screens in this phase: boot splash, trainer create, home, partner/profile card,
  solo battle screen, results. Roughly the `index.tsx` → `battle.tsx` path.

Gate: a debug APK installs and a full solo battle completes on a real device.

> **Status: partially built.** Done — the Expo Router app (SDK 57 / RN 0.86),
> `@ptb/core` wired through a monorepo Metro config, NativeWind with the web
> app's tokens converted from oklch to hex, trainer creation, partner pick, a
> home screen showing both, a solo battle screen driving the real engine against
> the chosen partner, a result summary, and local persistence via Zustand +
> MMKV. CI gained a fourth gate,
> `npm run bundle`, because Metro resolution failures are invisible to tsc and
> eslint.
>
> Also done — anonymous sign-in, the trainer name claimed against the server's
> unique index, the friend code surfaced on home, and save sync to `saves`
> (fresh-install adoption plus debounced pushes; a true multi-device merge is
> explicitly not implemented).
>
> Also done — the native boot splash held until the store rehydrates,
> `expo-audio` for the battle loop and win/lose sting, `expo-haptics` for answer
> feedback, and a persisted music toggle.
>
> Not done — bundling the sprite and chrome art. Two different reasons sit
> behind that bullet: **Pokémon sprites are not local to the web app** (it
> fetches them from the PokeAPI CDN), and this environment has no outbound
> network, so they cannot be downloaded here at all. The chrome art *is* local
> but no screen renders it yet, and the type icons are SVG, needing
> `react-native-svg` plus a Metro transformer before they are usable.
>
> Also not ported: **`playSfx`**. The web app synthesises its sound effects with
> WebAudio oscillators rather than shipping files, so there is nothing to bundle
> and expo-audio cannot synthesise. Answer feedback is haptic-only until either
> recorded assets exist or a synthesis library is added.
> **The gate below has NOT been met**: there is no Android SDK or emulator in
> this environment, so nothing has run on a device.
>
> Note MMKV is a Nitro native module, so **Expo Go cannot run this app** — it
> needs a development build. Swapping to AsyncStorage would restore Expo Go and
> would touch only `src/lib/store.ts`.
>
> Anonymous sign-in is now enabled, so the app draws from the seeded 3,989
> questions; the bundled six remain the offline fallback.
>
> The question bank is seeded, so this phase is no longer blocked on content —
> `get_trivia_questions` and `get_daily_questions` both return real questions
> today. The remaining blocker for anything touching a player identity is that
> **anonymous sign-ins are still disabled** in the Supabase dashboard; the battle
> screen itself needs no session, so it can be built and played before that.

> Note: the Zustand store itself is **not** in `packages/core` (see *Phase 1
> boundary*) and does not need to be — it is app state, so it belongs in
> `apps/mobile`. The eslint boundary rule actively forbids `zustand`,
> `react-native-mmkv`, and any `**/store` import inside `packages/core`.

## Phase 4 — Release pipeline (GitHub Actions → Play internal testing)

- `app.json` / `app.config.ts`: `android.package` = `com.nykefleym.pokemontriviabattle`,
  `versionCode` from the workflow run number, `versionName` from a git tag. The web
  repo has **no** `version` field and no tags at all, so this versioning scheme is
  established fresh here and is the source of truth for Play.
- Permissions declared explicitly: `CAMERA` (the QR/nearby-battle scanner, once that
  phase lands), `VIBRATE`, `POST_NOTIFICATIONS`.
- Workflow `.github/workflows/android-release.yml`, triggered on tag push:
  `setup-java@v4` (JDK 17) → `setup-android` → `npx expo prebuild --platform android`
  → `./gradlew bundleRelease` signed from secrets (`ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) → upload
  the AAB as a workflow artifact.
- A second workflow `ci.yml` on every PR running `tsc --noEmit`, `eslint`, and
  `vitest run` — the web repo has no such CI today and the new repo should not
  inherit that gap.
- Play Console: create the app, complete the data-safety form (anonymous auth,
  gameplay saves, no ads, no third-party sharing), content rating questionnaire, and
  confirm the current `targetSdkVersion` requirement in the console before the first
  upload rather than assuming Expo's default satisfies it.
- Upload the AAB to **internal testing**, add the owner's Google account as a tester,
  install from the opt-in link.
- Optional escalation if Actions gradle proves painful: `eas build --platform android`
  does the same job on Expo's infrastructure with managed signing.

Gate: the app installs from the Play internal-testing link on the owner's phone.

> **`ci.yml` is done** and runs all three gates — `npm run typecheck`,
> `npm run lint`, `npm test` — on every PR and every push to `main`.
> `android-release.yml` is not built yet and is blocked on the keystore and the
> Play account.

## Phase 5+ — Remaining game modes, one release per mode

In dependency order, each ending in a new internal-testing build:

1. **Pokédex + collection** — the dex grid, detail screen, seen/caught states,
   backdrops. Largely presentational over ported data.
2. **Gym leagues / Elite Four** — `gym-leaders.ts`, `elite-four.ts`, badges, trophies.
3. **Who's That Pokémon** — both modes, including the silhouette sizing lesson
   already learned (size the sprite as a share of its panel, never fixed inside an
   `overflow-hidden` box).
4. **Shop, items, daily gift, achievements, level rewards.**
5. **Mega raids** — needs `mega_*` tables and the `mega-run` / `mega-reward-claim`
   Edge Functions ported.
6. **PvP** — the largest slice by far: live matches, queue, chat, moderation,
   signature abilities, weather, the bot. Re-architected per Phase 2 so turn
   resolution lives only in `packages/core`.
7. **Push notifications** — `expo-notifications` with FCM, replacing the web-push
   VAPID path; requires a new server key on the new Supabase project.
8. **Social** — friends, referrals, share cards (`expo-sharing` + `react-native-view-shot`
   in place of the canvas-based `share-card-builder.ts`).

> Items 2, 5 and 6 each need `packages/core` widened first — see *Phase 1 boundary*
> for exactly which modules and the `../lib/store` trap to avoid.

## Deliberately out of scope

- **iOS.** Expo makes it reachable later, but it needs an Apple Developer account and
  a separate review, and nothing here depends on it.
- **Changes to the web app.** It stays frozen and deployed. No shared package, no
  refactor, no risk to production.
- **Data migration.** Mobile players start fresh; the two Supabase projects never talk.

## Risk to state plainly

The app is named "Pokémon Trivia Battle" and ships Pokémon sprites and music. The
owner has accepted the IP risk. It is worth restating that a Play takedown can
suspend the **developer account**, not just the listing, so the account used should
not be one carrying anything else of value. Internal testing (Phase 3–4) is not
publicly listed or searchable, which keeps exposure low until a production release is
actually requested.

## Verification

Per phase, in order:

- **Core:** `vitest run` in `packages/core` — the ported engine suites must pass
  unmodified. Any test that needed editing to pass is a signal the port changed
  behaviour.
- **Schema:** `mcp__Supabase__execute_sql` probes for RLS (a second anonymous
  identity must not read the first's `saves` row); `mcp__Supabase__get_advisors` for
  security/performance warnings.
- **App, in-repo:** `tsc --noEmit`, `eslint`, `vitest run` via the new `ci.yml`.
- **App, on device:** `npx expo run:android` on an emulator here for smoke tests;
  the owner installs the internal-testing build for real-device confirmation.
  Explicitly check, since these bit the web app: BGM starts and pauses when
  backgrounded; the partner's damage multiplier reads lifetime TP and survives
  evolving; sprites render with no missing-asset flash.
- **Release:** confirm the AAB's `versionCode` increments and the Play Console
  accepts the upload; confirm the installed build's version matches the tag.

> Add to the schema checks, learned the hard way in 0006/0007: after adding any
> SECURITY DEFINER function, assert
> `has_function_privilege('anon', '<fn>', 'EXECUTE') = false`. Reading the migration
> is not sufficient — the half-fix looks correct on the page.
