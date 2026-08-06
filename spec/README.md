# AVAR — Aarmos Verifiable Action Record

**One-line pitch.** Every autonomous-agent turn produces one signed, chain-linked
record. Anyone holding the exported bundle can verify it offline — in a browser
or from the command line — with no server, no vendor, and no network round-trip.

**What's in this folder**

| File | What it is |
|---|---|
| [`SPEC.md`](./SPEC.md) | Normative specification. The wire format and semantics. Read this to build a verifier. |
| [`spec/`](./spec/) | Normative companion specifications for objects with their own lifecycle. |
| [`fixtures/`](./fixtures/) | Normative. The executable conformance contract, published as `@avar-standard/fixtures`. |
| [`LICENSE`](./LICENSE) | CC BY 4.0 for the specification text. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Spec revision history. |

**Reference verifier** — [`Aarmatix/avar`](https://github.com/Aarmatix/avar),
published as `@avar-standard/core` and `@avar-standard/verify` (Apache-2.0).

## Status

**AVAR 1.0 (Normative).** This baseline supersedes all pre-normative revisions
(`1.0-rc1` through `1.20`). The wire format, canonical JSON rules, and chain
algorithm are stable. Field additions land as additive minor revisions that
remain readable by earlier `avar/1` verifiers.

## Verifier exit codes

A conforming command-line verifier reports the bundle verdict through its exit
code:

| Exit | Meaning | Bundle verdict |
|---:|---|---|
| `0` | Bundle verified locally. | `valid` or `valid-with-warnings` |
| `1` | Bundle parsed but failed verification, or is malformed / unreadable / not a zip. | `invalid` |
| `2` | Receipt file not found at the given path. | `FILE_NOT_FOUND` |

Stable error codes:
`BUNDLE_NOT_ZIP`, `BUNDLE_MISSING_FILES`, `BUNDLE_INVALID_JSON`,
`BUNDLE_INVALID_NDJSON`, `BUNDLE_SPEC_UNSUPPORTED`, `SPEC_VERSION_MISMATCH`,
`ENTRIES_SHA256_MISMATCH`, `SIGNATURE_MISMATCH`, `FINGERPRINT_MISMATCH`,
`CHAIN_BROKEN`, `STEP_CHAIN_BROKEN`, `MANIFEST_INVALID`, `FILE_NOT_FOUND`,
`FILE_UNREADABLE`, `UNKNOWN`.

## Why an open spec

- **Portability.** A bundle produced today must still verify in ten years,
  whether or not any particular vendor exists.
- **Auditor independence.** Compliance and security reviewers can build their
  own verifiers without asking anyone for permission.
- **Trust through mechanism, not marketing.** "Verifiable" is a testable
  property, not a badge.

## Governance

Aarmatix LLC is the steward for versions `1.x`. Editorial fixes and additive
changes ship with a CHANGELOG entry. A formal RFC process opens with `avar/2`.
Questions and proposals: open an issue in this repository.
