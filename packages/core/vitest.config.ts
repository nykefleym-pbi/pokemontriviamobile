import { defineConfig } from "vitest/config";

// `node`, not jsdom, and no setup file: the engine is platform-free and its
// tests must fail if that ever stops being true. Globals are off -- every test
// imports describe/it/expect from "vitest" explicitly, as the ported files do.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
