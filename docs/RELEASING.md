# Releasing to Google Play

Phase 4 of `docs/ROADMAP.md`. Internal testing track.

## One-time setup (owner)

### 1. Generate the upload key

```sh
./scripts/generate-upload-keystore.sh
```

**Run it on your own machine.** Not in CI, not in an agent sandbox. This key is
what proves to Play that an upload is yours; it is long-lived, and anything it
passes through keeps a copy — a CI log, an agent transcript, a chat message.
Generating it locally means the only copies are the file you hold and the
GitHub secret you paste it into.

Losing it is recoverable (Play can reset an upload key through support) but
slow, at exactly the moment you want to ship. Back the file up somewhere
durable. Never commit it — `.gitignore` already refuses `*.jks`.

### 2. Set four repository secrets

Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | the store password |
| `ANDROID_KEY_ALIAS` | `upload` (the script's default) |
| `ANDROID_KEY_PASSWORD` | the key password |

### 3. Play Console

Create the app under `com.nykefleym.pokemontriviabattle`, then complete:

- **Data safety** — anonymous auth, gameplay saves, no ads, no third-party
  sharing. Note the app stores a trainer name the player types; that is
  user-generated content, not personal data collected from the device.
- **Content rating** questionnaire.
- **Target API level** — check the console's *current* requirement before the
  first upload rather than assuming Expo's default already satisfies it. It
  moves every year and a mismatch is rejected at upload, not at build.

## Cutting a release

```sh
git tag v0.1.0
git push origin v0.1.0
```

That triggers `.github/workflows/android-release.yml`, which runs the same four
gates as CI, prebuilds the native project, builds a signed AAB, and uploads it
as a workflow artifact. Download it from the run's summary page and upload to
the **internal testing** track.

`workflow_dispatch` is also wired, so a build can be re-run without moving a
tag.

## How versioning works, and why it is not in a file

- `versionCode` = the **workflow run number**. It only ever increases and is
  unique per run. Play rejects an upload whose `versionCode` it has seen, and a
  hand-maintained integer in a JSON file is precisely the thing that gets
  forgotten on a release day.
- `versionName` = the **git tag**, minus its leading `v`, so the tag and the
  string in Play's console cannot disagree.

Both are read by `apps/mobile/app.config.ts`, which falls back to local
defaults so `expo start` and `expo export` work with no environment set.

## What is NOT automated

Uploading to Play. The workflow stops at the artifact deliberately: automated
publishing needs a Google service account with release permissions, which is a
second long-lived credential to manage, and the first few builds want a human
looking at them anyway. Adding `r0adhouse/upload-google-play` or similar is a
later decision, not a gap.

## Verification

The workflow has **never been run end to end** — it needs the secrets above,
and gradle cannot be exercised in the development sandbox (no Android SDK).
Treat the first tag push as the real test, and expect to iterate on it.

What HAS been verified locally, by running it:

- `npx expo prebuild --platform android --no-install` **from `apps/mobile`**,
  with `ANDROID_VERSION_CODE=42 APP_VERSION=1.2.3`, writes
  `apps/mobile/android/app/build.gradle` with `versionCode 42` and
  `versionName "1.2.3"`. The CI version plumbing works.
- The same command **from the repo root does not fail** — it succeeds against
  Expo's defaults, which is what made this dangerous. It writes a root
  `./android` with `applicationId com.anonymous.pokemontriviamobile`,
  `versionCode 1`, `versionName "1.0.0"`, plus a root `app.json` pinning that
  wrong package and expo dependencies added to the root `package.json`. The
  workflow originally had no `working-directory` on that step.

If you ever run `prebuild` locally to debug a build: it edits tracked files.
From `apps/mobile` it rewrites the `android`/`ios` scripts in
`apps/mobile/package.json`; from the root it also writes `app.json` and edits
the root `package.json`. Check `git status` and revert before committing.

## If the first build fails

Expect it to, once or twice. Read the failing step before changing anything:

- **A gate fails** (typecheck/lint/test/bundle) — the tag was cut from a commit
  that would not have passed a PR. Fix on a branch, merge, re-tag.
- **`prebuild` fails** — an Expo config or plugin problem, reproducible locally
  with the exact command above. No Android SDK needed.
- **`gradlew bundleRelease` fails** — the first genuinely new surface. Usually
  the target API level or an AGP/JDK mismatch. Not reproducible in the sandbox.
- **Signing fails** — check the four secrets, and that `ANDROID_KEY_ALIAS`
  matches the alias in the keystore (`upload` by default). `keytool -list -v
  -keystore upload.jks` shows it.

Use `workflow_dispatch` to re-run without moving the tag; `versionCode` comes
from the run number, so every attempt still gets a unique one.
