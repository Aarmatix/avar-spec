// Build @aarmos/avar-verify-wasm.
//
// 1. Bundle src/entry.js into a single ESM-free CommonJS-free IIFE that
//    Javy/QuickJS can execute (no dynamic import, no top-level await).
// 2. Invoke `javy build` to produce dist/verify.wasm.
//
// Prereq: `javy` on PATH. Download from
// https://github.com/bytecodealliance/javy/releases. This script fails loudly
// if it's missing so CI matches local behavior.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");
if (!existsSync(dist)) mkdirSync(dist, { recursive: true });

const bundlePath = resolve(dist, "verify.bundle.js");
const wasmPath = resolve(dist, "verify.wasm");

console.log("→ bundling src/entry.js");
await build({
  entryPoints: [resolve(root, "src/entry.js")],
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "neutral",
  outfile: bundlePath,
  legalComments: "none",
  minify: false,
});
console.log("  wrote", bundlePath);

console.log("→ compiling to WASM with javy");
try {
  execFileSync("javy", ["build", "-o", wasmPath, bundlePath], { stdio: "inherit" });
} catch (err) {
  console.error("javy build failed. Install javy from",
    "https://github.com/bytecodealliance/javy/releases");
  process.exit(1);
}
console.log("  wrote", wasmPath);
