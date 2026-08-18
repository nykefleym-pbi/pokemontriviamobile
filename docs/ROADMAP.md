# Roadmap — Pokémon Trivia Battle Mobile

Phase 1 is done. Everything below it is planned, not built.

## Phase 1 — foundations ✅

- Supabase project `dpmnugfbawebozwihmer` (`ap-northeast-1`), 5 migrations applied.
- `packages/core` — the battle engine, ported from the web app and passing 42 tests.
- CI: typecheck + test on every PR.

## Phase 2 — `apps/mobile`, the Expo app

Does not exist yet. Bring up in this order, because each step is testable alone:

1. Expo SDK app, TypeScript, expo-router.
2. `@supabase/supabase-js` + `signInAnonymously()` on first launch. The auth
   trigger allocates the profile and friend code, so the client never invents one.
3. Wire `packages/core` in through Metro. Metro must be told about the workspace
   root or it will not resolve `@ptb/core` out of `packages/`.
4. A solo battle screen driven by `replayBattle` / `applyNextAction`.

## Phase 3 — sign-in

Approved decisions: **guest-first with upgrade**, **email only** for the first
release, **6-digit OTP** (not magic link), **no PII in `profiles`**.
Google / Facebook / phone come later.

Two things here are easy to get wrong and expensive to discover late:

**Upgrading a guest is `updateUser`, not `signInWithOtp`.** Calling
`signInWithOtp()` while holding an anonymous session creates a brand-new user and
silently strands all guest progress — no error, the player just loses everything.

| Case | Call | Then verify with |
| --- | --- | --- |
| Guest → account (upgrade) | `updateUser({ email })` | `verifyOtp({ type: "email_change" })` |
| Returning player, fresh install | `signInWithOtp({ email })` | `verifyOtp({ type: "email" })` |

Two different `type` values behind one screen. Separate functions, separate
tests — never one function with a boolean parameter.

**The email template must include `{{ .Token }}`.** Supabase's default template
sends `{{ .ConfirmationURL }}`, a magic link. Ship that and the player receives a
link and no code, and the OTP screen cannot be completed at all.

Also required before this phase can ship: custom SMTP (the built-in mailer is a
few messages an hour and is not for production), and anonymous sign-ins left
enabled.

## Phase 4 — Google Play internal testing

EAS Build → AAB → Play Console internal testing track. Needs a Play developer
account. Bump `runtimeVersion` policy before the first submission, not after.

## Backlog

- Seed `curated_questions` — it is empty, so the trivia bank serves nothing today.
- The battle Edge Function (imports `@ptb/core`; writes `solo_battles`).
- Save sync against `saves.version` (last-write-wins).
