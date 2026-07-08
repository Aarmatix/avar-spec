# Changelog

All notable changes to the AVAR specification are recorded here.
This project follows [Semantic Versioning](https://semver.org/).

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
