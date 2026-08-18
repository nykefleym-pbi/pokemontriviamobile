// Monorepo Metro config. Without this, `@ptb/core` resolves to nothing at
// bundle time even though tsc and the editor are perfectly happy with it —
// Metro only watches the app directory by default, and hoisted workspace
// packages live two levels up.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole workspace so edits in packages/core trigger a rebuild.
config.watchFolders = [workspaceRoot];

// 2. Resolve from the app's node_modules first, then the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Only look in the paths above. Without this Metro walks up the tree and
//    can pick up a second copy of React from an unexpected level, which fails
//    at runtime with the "two Reacts" invalid-hook-call error rather than at
//    build time.
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: "./src/global.css" });
