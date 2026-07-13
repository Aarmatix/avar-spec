# AVAR Specification — Changelog

All notable changes to the AVAR specification are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.2] — 2026-07-13

Wave 2 — Cross-Party Receipt Binding + Pre-Flight extension namespace.
Additive; verifiers built for `1.0` / `1.1` accept `1.2` bundles per §10
(unknown fields are opaque data included in canonical JSON).

### Added
- `AvarEntry.parentReceipt?: { hash, issuer?, traceId?, protocol? }` —
  callee pins the caller's finalized `entryHash` to bind cross-boundary
  runs (A2A / MCP-remote / OpenAPI / custom). Wire format:
  `x-avar-parent-receipt` header carrying base64url canonical JSON.
  Recipients MUST ignore malformed values and MUST NOT dispatch a tool
  based on header contents alone. See `SPEC-ADDENDUM-1.2.md`.
- Reserved extension namespace `x-preflight` on entry bodies for the
  new `aarmos preflight` pipeline (Matrix Lint · Capability
  Attestation · Environmental Context). Extension fields are included
  in canonical JSON per §2 so `entryHash` covers them byte-exactly;
  verifiers that do not know the namespace treat it as opaque data.
  See `reference/extensions/x-preflight.md`.
- Reserved additive verdicts introduced by `1.2`: `PREFLIGHT_PASS`,
  `PREFLIGHT_FAIL`.

### Reference implementations
- `@aarmos/avar-core@1.9.0` — canonical `stepHash` / `entryHash`
  helpers exported for deterministic replay; `fflate` dependency
  restored, `.d.ts` emission fixed for typed consumers.
- `@aarmos/cli@0.22.0` — `aarmos preflight` + `aarmos preflight
  install-hook` (print-only by default; `--force` opt-in). Signed
  `preflight.pass/fail` receipts stored in `.aarmos/preflight/`
  pinned by SHA-256.
- `@aarmos/bundle-schema@0.3.0` — redaction allowlist preserves
  chain-integrity fields (`prevHash`, `entryHash`, `steps`) so
  exported `.aarmos` bundles remain replayable with `aarmos replay
  --verify-chain`.
- `@aarmos/invite-schema@0.1.0` — `AarmosInvite v1` GA.

## [1.1] — 2026-07-07

Wave 1.2 — Human Oversight Control. Additive, backward-compatible with `avar/1.0-rc1`; verifiers built for `1.0` accept `1.1` bundles per §10.

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
