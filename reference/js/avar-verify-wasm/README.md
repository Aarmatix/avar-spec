# @aarmos/avar-verify-wasm

Portable **WebAssembly (WASI-preview1)** build of the AVAR bundle verifier.
Bit-for-bit parity with [`@aarmos/avar-core`](../avar-core) — same canonical
JSON, same hash chain, same Ed25519 verification. Ship the same verifier
into Go, Rust, Python, Java, or plain shell workflows without pulling in a
JS runtime on the host.

- `dist/verify.wasm` — the compiled verifier (Javy + QuickJS + pure-JS
  crypto via `@noble/hashes` and `@noble/curves`).
- `dist/verify.bundle.js` — the source bundle Javy compiled from.
- `examples/node-host.mjs` — Node.js WASI host wrapper (`node:wasi`).
- `test/parity.test.mjs` — smoke test that compares WASM output against
  `@aarmos/avar-core` on the same bundle.

## Wire contract

The WASM verifier reads a **JSON-safe bundle** from `stdin` and writes a
`VerificationReport` (see `@aarmos/avar-core`) to `stdout`.

Input schema:

```jsonc
{
  "specVersion": "avar/1",
  "manifest":    { /* BundleManifest */ },
  "entries":     [ /* AvarEntry[] */ ],
  "entriesNdjson": "…raw NDJSON bytes as a UTF-8 string…",
  "pubkeys":     { "keys": [ /* … */ ] }
}
```

`entriesNdjson` replaces `entriesNdjsonBytes` from the JS type because
JSON has no `Uint8Array`. The WASM re-hashes it with SHA-256 the same way
the JS verifier does over the raw bytes.

## Running under Wasmtime / Wasmer

```bash
wasmtime run --dir=. dist/verify.wasm < bundle.json > report.json
wasmer  run --dir=. dist/verify.wasm < bundle.json > report.json
```

## Running under Node.js

```js
import { verifyWithWasm } from "@aarmos/avar-verify-wasm/examples/node-host.mjs";

const report = await verifyWithWasm(bundleJson);
if (report.verdict === "invalid") process.exit(1);
```

## Rebuilding

`npm run build` re-bundles `src/entry.js` with esbuild and re-invokes
`javy build` to emit `dist/verify.wasm`. Requires
[`javy`](https://github.com/bytecodealliance/javy/releases) on `PATH`.

## Parity guarantee

`test/parity.test.mjs` runs the WASM verifier against the JS reference and
asserts identical verdicts + counters. Any drift fails CI. The verifier
core (`src/entry.js`) mirrors `packages/avar-core/src/{canonicalize,hash,
signature,verify}.ts` line-for-line — changes to those files MUST be
mirrored here.

License: Apache-2.0 · © Aarmatix LLC
