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

The workflow has **never been run** — it needs the secrets above, and its
gradle build cannot be exercised in the development sandbox (no Android SDK).
Treat the first tag push as the real test, and expect to iterate on it.
