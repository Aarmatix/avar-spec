# Changelog

All notable changes to the AVAR specification are recorded here.
This project follows [Semantic Versioning](https://semver.org/).

## 1.1.0 — 2026-07-08

### Added
- `@aarmos/avar-core@1.1.0`: canonical structural diff engine
  (`diffCanonical`) plus three domain wrappers:
  - `diffReceipts(a, b)` — bundles or single entries, id-matched, flags
    signature / entry-hash / step changes and chain-head extension.
  - `diffPolicies(a, b)` — schema-agnostic canonical diff for policy JSON.
  - `diffToolManifests(a, b)` — schema-agnostic canonical diff for tool
    manifests.
- `avar` standalone binary bumped to `1.1.0` with a new `diff` subcommand:
  `avar diff <a> <b> [--kind=receipts|policies|manifests] [--json]`.
  Exit code `0` when equal, `1` when different. Zero network.

### Notes
- Diff is a free, open primitive — same posture as `avar verify`. The
  reference library and CLI ship under Apache-2.0 in the open spec repo.

## [1.0.0-rc] — 2026-07-08

### Added
- Initial public release of the AVAR specification.
- Canonical JSON form, Ed25519 signature scheme, SHA-256 hash chain.
- Bundle verification rules.
- Reserved `action.protocol` identifiers: `mcp`, `openapi`, `deeplink`, `custom`.

## 1.0.0 — 2026-07-08

- Add JavaScript reference implementation at `reference/js/`, published
  to npm as `@aarmos/avar-core@1.0.0` under Apache-2.0.
- Promote spec from `1.0.0-rc` to `1.0` (stable wire format).
- Root `README.md`: prominent one-line `npx` verify command, reference
  implementation section, updated status.
