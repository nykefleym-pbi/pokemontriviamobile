import type { ExpoConfig } from "expo/config";

/** Was app.json. It is TypeScript now for one reason: Play needs a
 *  monotonically increasing `versionCode`, and a static file cannot produce
 *  one. CI supplies both numbers.
 *
 *  - `versionCode` comes from the workflow run number, which only ever goes up
 *    and is unique per run. Play REJECTS an upload whose versionCode it has
 *    seen before, and a hand-maintained integer is exactly the thing that gets
 *    forgotten on a release day.
 *  - `versionName` comes from the git tag that triggered the release, minus its
 *    leading `v`, so the tag and the string in Play's console always agree.
 *
 *  Both fall back to local-development values, so `expo start` and
 *  `expo export` work with no environment at all. */
const versionCode = Number(process.env.ANDROID_VERSION_CODE ?? 1);
const versionName = (process.env.APP_VERSION ?? "0.1.0").replace(/^v/, "");

const config: ExpoConfig = {
  name: "Pokémon Trivia Battle",
  slug: "pokemon-trivia-battle",
  version: versionName,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "pokemontriviabattle",
  userInterfaceStyle: "light",
  android: {
    package: "com.nykefleym.pokemontriviabattle",
    versionCode,
    adaptiveIcon: {
      backgroundColor: "#0f1b2d",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    // Declared explicitly rather than inherited from whatever a library asks
    // for, because every permission is a line on the Play listing a player
    // reads before installing.
    //
    // VIBRATE is genuinely used now — answerHaptic fires on every answer.
    // POST_NOTIFICATIONS is declared ahead of the push work so the Play
    // data-safety form does not have to be revised mid-track.
    // CAMERA is deliberately ABSENT until the QR/nearby-battle scanner exists:
    // asking for the camera before anything uses it is the kind of thing that
    // gets an install abandoned.
    permissions: ["android.permission.VIBRATE", "android.permission.POST_NOTIFICATIONS"],
  },
  web: { output: "static", favicon: "./assets/images/favicon.png" },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0f1b2d",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    supabaseUrl: "https://dpmnugfbawebozwihmer.supabase.co",
    supabaseAnonKey: "sb_publishable_9UHc4MJfQxgmOR3CUQBkQA_8gPQ184n",
  },
};

export default config;
