# `@ptb/mobile`

The Expo app. Expo SDK 57 · React Native 0.86 · expo-router · NativeWind 4.

```sh
npm install          # from the repo root — this is an npm workspace
npm run typecheck --workspace @ptb/mobile
npm run bundle    --workspace @ptb/mobile   # Metro bundle, the CI gate
npm start         --workspace @ptb/mobile   # dev server
```

## Two things to know before changing anything

**`metro.config.js` is load-bearing.** It sets `watchFolders`,
`nodeModulesPaths` and `disableHierarchicalLookup` so Metro can resolve
`@ptb/core` out of the workspace root. Break it and `tsc` and eslint still
pass — Metro resolution is invisible to them — and the app red-screens on a
phone instead. `npm run bundle` is in CI for exactly this reason.

**The client never holds the answer key.** `get_trivia_questions` projects
`correct_index` away, so `src/lib/questions.ts` asks `grade_trivia_answer` for
correctness and feeds the boolean into the engine. Do not add a local
comparison — see `docs/HANDOVER.md`.

## Running it

**Expo Go will not work.** `react-native-mmkv` v4 is a Nitro native module and
Expo Go does not bundle it. Use a development build:

```sh
npx expo run:android      # needs an Android SDK
```

## Status

Built: trainer creation, partner pick, home, a solo battle driven by
`@ptb/core`, a result summary, and local persistence (Zustand + MMKV).

Not built: boot splash, save sync to `saves`, audio, haptics, sprite bundling.
Nothing has run on a real device yet. See `docs/ROADMAP.md` Phase 3.

The app currently plays a bundled six-question fallback. The seeded bank of
3,989 needs a signed-in session, and anonymous sign-in is still disabled in the
Supabase dashboard.
