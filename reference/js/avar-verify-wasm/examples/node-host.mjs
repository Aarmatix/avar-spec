// Node.js host wrapper — runs dist/verify.wasm via node:wasi and returns the
// JSON VerificationReport. Same shape as @aarmos/avar-core verifyBundle,
// except the input is a JSON-safe bundle (see README for schema).
import { WASI } from "node:wasi";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = resolve(here, "../dist/verify.wasm");

/**
 * @param {object} bundleJson  { specVersion, manifest, entries, entriesNdjson, pubkeys }
 * @returns {Promise<object>}  VerificationReport (or { verdict:"invalid", error, detail })
 */
export async function verifyWithWasm(bundleJson) {
  const dir = mkdtempSync(resolve(tmpdir(), "avar-wasm-"));
  const stdinPath = resolve(dir, "in");
  const stdoutPath = resolve(dir, "out");
  writeFileSync(stdinPath, JSON.stringify(bundleJson));
  writeFileSync(stdoutPath, "");
  try {
    const wasi = new WASI({
      version: "preview1",
      args: ["verify"],
      env: {},
      stdin: (await import("node:fs")).openSync(stdinPath, "r"),
      stdout: (await import("node:fs")).openSync(stdoutPath, "w"),
    });
    const wasmBytes = await readFile(WASM_PATH);
    const mod = await WebAssembly.compile(wasmBytes);
    const instance = await WebAssembly.instantiate(mod, wasi.getImportObject());
    wasi.start(instance);
    const out = readFileSync(stdoutPath, "utf8");
    return JSON.parse(out);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}
