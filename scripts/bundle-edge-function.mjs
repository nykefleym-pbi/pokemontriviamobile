// Bundles a Supabase Edge Function that imports from packages/core into one
// self-contained ESM file.
//
// Why this exists: Deno cannot resolve the function's relative imports into
// packages/core without the whole repo present on the deploy target, and
// Supabase's deploy API takes a FLAT FILE LIST, not a directory tree. Without
// bundling, the only alternative is a hand-copied duplicate of the engine
// inside supabase/functions — which is exactly the drift this architecture
// exists to prevent.
//
// Usage: node scripts/bundle-edge-function.mjs <function-name>
// Writes supabase/functions/<name>/.bundle.ts — a build artifact, gitignored.
// Regenerate before every deploy; never hand-edit it.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/bundle-edge-function.mjs <function-name>");
  process.exit(1);
}

const entry = path.join(repoRoot, "supabase", "functions", name, "index.ts");
const outfile = path.join(repoRoot, "supabase", "functions", name, ".bundle.ts");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "esnext",
  // Deno resolves npm: and jsr: specifiers itself at runtime. esbuild has no
  // resolver for them and must leave them as literal imports.
  external: ["npm:*", "jsr:*"],
  // Most of the size is the Pokédex, which the engine needs to look up any
  // species by id. Minify so the deployed artifact stays reasonable.
  minify: true,
  logLevel: "info",
});

console.log(`Bundled ${entry} -> ${outfile}`);
