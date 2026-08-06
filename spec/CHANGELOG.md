# AVAR Specification — Changelog

All notable changes to the AVAR specification are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Conformance architecture] — 2026-08-04

Not a change to AVAR 1.0 wire semantics. A change to how conformance is
defined, tested, and published.

### Added
- `IMPLEMENTATION.md` — normative. Defines what it means to *be* an AVAR
  implementation: six requirements, applied recursively to every AVAR version a
  package claims to support. Software below that bar is experimental and may
  not describe itself as an AVAR verifier.
- Invariants I-A through I-F, including **I-F fixture immutability**: a
  published fixture corpus is never overwritten; corrections publish a new
  corpus version.
- Fixture-corpus versioning as a layer independent of the specification version
  and of implementation versions. The corpus publishes as
  `@avar-standard/fixtures@<corpus-version>`; `index.json` now carries
  `corpusVersion` (first corpus: `1.0.0`).
- Conformance matrix with an `Independence` column stated in words, and a
  deliberately empty third-party row.
- Statement of scope: third-party implementations are encouraged but not
  required. One conforming implementation defines the standard; multiple
  independently developed ones strengthen confidence in it.

### Corrected
- **`@avar-standard/verify-wasm@0.1.x` never achieved normative AVAR
  conformance.** As published it was unimportable, and it predated the AVAR 1.0
  normalization. Earlier changelog entries that presented `0.1.1` as a usable
  public verifier were wrong. The package is permanently deprecated; a future
  non-JS verifier ships as `verify-rs`, never under the `verify-wasm` name.

## [1.0 Normative] — 2026-08-04

**Normalization.** AVAR moves from a base spec plus nineteen incremental
addenda to a single normative baseline, before first public adoption. There is
no migration: AVAR had no external adopters and no third-party producers at the
time of normalization.

### Changed
- `SPEC.md` is now the sole normative definition of receipt semantics: Entry
  (the atom), Bundle (packaging), Verification Result (the specified output).
- camelCase is normative for every field in every AVAR object.
- Unknown-field tolerance becomes a stated guarantee from 1.0 onward: verifiers
  name unresolved fields rather than ignoring them (§2.1, §6.4).
- Specification and fixtures together define conformance; a disagreement is a
  specification defect that blocks publication.
- Normative vs. informative is stated explicitly (§0.1). ADRs, examples, and
  rationale are informative.

### Added
- §0.2 the three layers; §6.5 the closed issue-kind set; §9 conformance and the
  launch gate; §10 verdict-bearing change control and the dependency direction
  `specification -> fixtures -> reference implementation -> producers`.
- Invariants: exactly one normative definition of AVAR semantics; no
  private-only receipt semantics.

### Moved
- Addenda 1.2, 1.3, 1.4, 1.5, 1.9, 1.10, 1.11, 1.14, 1.19, 1.20 folded into
  `SPEC.md` and retained under `history/` as informative.
- Addenda 1.6, 1.7, 1.8, 1.12, 1.13, 1.15, 1.16, 1.18 promoted to normative
  companion specifications under `spec/`.

### Wire compatibility
None broken. The wire family token remains `avar/1`, canonicalization, hashing,
signing, and every field name are unchanged from the runtime's emitted form.
Existing bundles verify byte-identically under 1.0.


## [1.11] — 2026-08-02

SPEC-ADDENDUM-1.11 — Chain Closure. Additive and OPTIONAL; pre-1.11 verifiers ignore `closure` as opaque data per §2 and continue to report `valid`.

### Added
- `AvarEntry.closure?` — signed, terminal chain-closure marker (`workspaceId`, `reason`, `closedAt`, `finalEntryHash`, `closedEntryCount`, optional `note`).
- Producer rules C1–C5: terminal, signed, self-consistent, singular per workspace, non-destructive.
- Verifier issue kinds `closure-invalid`, `closure-duplicate`, `closure-violated` (all hard failures).
- `VerificationReport.closure?` and the **`closed` success verdict**. Conformant CLIs exit `0` on `closed`.

### Notes
- Closure is not deletion and not revocation. It records that no further entries will be appended; prior entries remain verifiable forever.

## [1.1] — 2026-07-07

 — Human Oversight Control. Additive, backward-compatible with `avar/1.0-rc1`; verifiers built for `1.0` accept `1.1` bundles per §10.

### Added
- `DecisionStep.decision` broadened to `string` (open-ended). Verifiers MUST treat unknown values as opaque data. Reserved additive verdicts introduced by `1.1`: `KILL`, `KILL_REVERT`.
- `DecisionStep.killScope?: "all" | "writes" | "destructive"` — kill-switch scope stamped on `KILL` / `KILL_REVERT` entries.
- `DecisionStep.frameworks?: string[]` — per-step framework tags.
- Framework vocabulary: `eu-ai-act:art-14` (human oversight), `nist-ai-rmf:manage-2.3` (human oversight controls).

## [1.0-rc1] — 2026-07-06

Initial release candidate. Subject to change until `1.0` GA.

### Added
- Canonical JSON rules (§2) — UTF-8, NFC, UTF-16 code-unit key sort, no `undefined`, finite numbers, no trailing newline.
- `AvarEntry` type and signed-body definition (§3).
- Ed25519 signature envelope (§3.3).
- Entry-level hash chain with `GENESIS_PREV_HASH` and legacy-unchained-reset rule (§4.1, §4.2).
- Per-step hash chain with `GENESIS_PREV_STEP_HASH` (§4.3).
- `AvarBundle` zip envelope with `SPEC-VERSION`, `manifest.json`, `entries.ndjson`, `pubkeys.json` (§5).
- `VerificationReport` shape and 9-step verification algorithm (§6).
- Redaction contract (§7) — non-enforced, mechanism-only.
- Framework tag closed vocabulary v1: `eu-ai-act:art-12`, `hipaa:164.312-b`, `soc2:cc7.2`, `nist-ai-rmf:measure-2.7`, `iso-42001:8.4` (§8).
- Golden fixture set — 8 normative fixtures (§9).
- Reserved `seatId` field on `AvarEntry` for future multi-seat aggregation.

### Governance
- Aarmatix LLC stewards `1.x`; formal RFC process opens at `avar/2`.
- Spec text licensed under CC-BY-4.0.
