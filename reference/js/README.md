# @aarmos/avar-core

> **Source of truth:** [`Aarmatix/avar-spec/reference/js`](https://github.com/Aarmatix/avar-spec/tree/main/reference/js).
> This directory in the Aarmos product monorepo is a working copy kept in
> lockstep with the spec repo. Bug reports, PRs, and RFCs go to
> [`Aarmatix/avar-spec`](https://github.com/Aarmatix/avar-spec) — see
> [`SYNC.md`](./SYNC.md).

Reference implementation of the [AVAR specification](https://github.com/Aarmatix/avar-spec/blob/main/SPEC.md) — canonical JSON, Ed25519 signature verification, hash-chain math, and bundle verification.

**Pure.** No DOM references, no Node built-ins, no external dependencies. Runs identically in browsers (WebCrypto) and Node.js 20+ (`globalThis.crypto.subtle`).

**Normative.** Consumed by:
- The Aarmos PWA at [`/trust/verify`](https://www.aarmos.io/trust/verify) (browser drop-zone).
- The `aarmos verify` CLI in [`@aarmos/cli`](https://www.npmjs.com/package/@aarmos/cli).
- The internal recorder in `src/lib/avar/` (chain + signature production).

All three call the same `verifyBundle()`. Divergence between them is guarded by the golden fixtures in [`test/fixtures/`](./test/fixtures/) — see spec §9.

## Install

```sh
npm i @aarmos/avar-core
```

Or verify a bundle without installing anything:

```sh
npx -p @aarmos/cli aarmos verify path/to/bundle.avar.zip
```

## API

```ts
import {
  // Types
  type AvarEntry, type AvarBundle, type VerificationReport,
  // Canonical JSON
  canonicalize,
  // Hash / chain
  sha256Hex, computeEntryHash, computeStepHash,
  GENESIS_PREV_HASH, GENESIS_PREV_STEP_HASH,
  // Signature
  verifySignature, computeDeviceFingerprint,
  // Verification (top-level)
  verifyBundle,
} from "@aarmos/avar-core";
```

## License

Apache-2.0. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

## Spec revision

Tracks `avar/1` spec revision `1.0`. See the [AVAR spec](https://github.com/Aarmatix/avar-spec/blob/main/SPEC.md) for the current revision and changelog.
