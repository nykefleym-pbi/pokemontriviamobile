import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.expo/**", "**/*.tsbuildinfo"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // A leading underscore is this codebase's marker for an intentionally
    // unused binding (destructured discards in the ported tests rely on it).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },

  {
    // Metro, Babel and Tailwind configs are loaded by Node before any bundler
    // runs, so they are CommonJS by necessity, not by choice.
    files: ["**/*.config.js", "**/metro.config.js", "**/babel.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "writable",
        require: "readonly",
        __dirname: "readonly",
        process: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  {
    // packages/core is the isomorphic battle engine: the same files run in the
    // Expo app (optimistic preview) and in Edge Functions (authority). Nothing
    // in here may touch UI, the network, or ambient randomness/time.
    //
    // Ported from the web app's eslint.config.js, with one loophole closed: the
    // web version bans only the ALIASED form (`@/lib/store`), so the relative
    // form `../lib/store` slipped past it and two engine files reached a zustand
    // module that way. This repo has no aliases, so the patterns below match
    // relative paths instead.
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react-*", "react-native", "react-native-*", "expo", "expo-*"],
              message: "packages/core is isomorphic — no React, no React Native, no Expo.",
            },
            {
              group: ["@tanstack/*", "expo-router"],
              message: "packages/core is isomorphic — no router/query.",
            },
            {
              group: ["@supabase/*", "**/integrations/*", "**/supabase/*"],
              message: "packages/core never talks to the network or database.",
            },
            {
              group: ["**/components/*", "**/hooks/*", "**/routes/*", "**/app/*"],
              message: "packages/core must not depend on UI.",
            },
            {
              group: ["**/store", "**/store/*", "zustand", "zustand/*", "react-native-mmkv"],
              message: "packages/core must not depend on client state or its storage.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: "Engine code must be deterministic — take an Rng (engine/rng.ts) as input.",
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "Engine code must be deterministic — time arrives in action payloads.",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Engine code must be deterministic — time arrives in action payloads.",
        },
      ],
    },
  },

  {
    // Inherited debt, recorded here rather than by editing the ported files so
    // they stay byte-identical to their web-app originals.
    //
    // `rollAbilityId` (abilities.ts) and `shuffleTriviaOptionsWithOrder`
    // (trivia-core.ts) both call Math.random. Neither is REACHABLE from the
    // engine: the engine imports these two modules type-only (`AbilityId`,
    // `Trivia`), and neither function has a caller anywhere in this package —
    // verified, not assumed. They ride along because the types live in the same
    // file. So the replay guarantee is intact today.
    //
    // Whichever phase first CALLS one of these must give it an Rng parameter
    // instead, and delete the corresponding line below. Until then this is the
    // register of known impurity — keep it short.
    files: ["packages/core/src/lib/abilities.ts", "packages/core/src/lib/trivia-core.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
);
