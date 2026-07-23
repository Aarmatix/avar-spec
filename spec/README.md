# AVAR — Aarmos Verifiable Action Record

**One-line pitch.** Every AI agent turn produces one signed, hash-chained record. Anyone with the exported bundle can verify it offline in a browser or from the command line — no server, no vendor, no network round-trip.

**What's in this folder**

| File | What it is |
|---|---|
| [`SPEC.md`](./SPEC.md) | Normative specification. Read this to build a verifier. |
| [`LICENSE`](./LICENSE) | CC-BY-4.0 for the specification text. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Spec revision history. |

**Reference implementation** — [`@avar-standard/core`](https://www.npmjs.com/package/@avar-standard/core) (published from [`Aarmatix/avar`](https://github.com/Aarmatix/avar)).
**CLI verifier** — `avar verify <bundle.zip>` — standalone binary via `brew install aarmatix/tap/avar`, or use `@aarmos/cli` for the full Aarmos runtime.
**Browser verifier** — `/trust/verify` on any Aarmos install (offline, WebCrypto only).

## `aarmos verify` — exit codes and `--json` shape

The CLI, the bridge (`aarmos.testConnection` and friends), and the browser verifier all speak the same **AarmosError** taxonomy (`code` / `message` / `hint` / `docsUrl`). Scripts and CI can rely on the exit code alone; humans read the one-line stderr formatter; automation reads `--json`.

| Exit | Meaning | Bundle verdict |
|---:|---|---|
| `0` | Bundle verified locally. | `valid` or `valid-with-warnings` |
| `1` | Bundle parsed but failed verification, OR bundle is malformed / unreadable JSON / not a zip. | `invalid` |
| `2` | Receipt file not found at the given path. | `FILE_NOT_FOUND` |

`--json` always writes exactly one line to stdout. On success it is the raw `VerificationReport`; on failure it is either `{ verdict: "invalid", error: AarmosError }` (parse errors) or `{ ...report, error: AarmosError }` (verification failure, with the most-severe issue classified). `--quiet` suppresses non-error output — the exit code carries the verdict.

Stable AarmosError codes emitted by `aarmos verify`:
`BUNDLE_NOT_ZIP`, `BUNDLE_MISSING_FILES`, `BUNDLE_INVALID_JSON`, `BUNDLE_INVALID_NDJSON`, `BUNDLE_SPEC_UNSUPPORTED`, `SPEC_VERSION_MISMATCH`, `ENTRIES_SHA256_MISMATCH`, `SIGNATURE_MISMATCH`, `FINGERPRINT_MISMATCH`, `CHAIN_BROKEN`, `STEP_CHAIN_BROKEN`, `MANIFEST_INVALID`, `FILE_NOT_FOUND`, `FILE_UNREADABLE`, `UNKNOWN`. Each has a stable `docsUrl` so operators can jump straight to remediation.

## Status

`avar/1` spec revision `1.1` — release candidate (backward-compatible with `1.0-rc1`). The wire format, canonical JSON rules, and chain algorithm are unlikely to change before `1.0` GA. Field additions and new decision sources land as minor revisions (`avar/1.2`, …) that remain readable by earlier `avar/1` verifiers.

## Why an open spec

- **Portability.** A bundle produced by Aarmos today must still verify in ten years, whether or not Aarmatix LLC exists.
- **Auditor independence.** Compliance and security reviewers can build their own verifiers without asking us for anything.
- **Trust through mechanism, not marketing.** "Verifiable" is a testable property, not a badge.

## Governance

Aarmatix LLC is the steward for versions `1.x`. Editorial fixes and additive changes ship with a CHANGELOG entry. A formal RFC process opens with `avar/2`. Non-editorial questions and proposals: file an issue in the reference-implementation repository.
