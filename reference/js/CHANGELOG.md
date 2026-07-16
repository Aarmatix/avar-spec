# @aarmos/avar-core — Changelog

## 1.9.0-rc.2 — 2026-07-13

Coordinated bump aligning `next` dist-tag with `cli@0.21.0-rc.2`,
`invite-schema@0.1.0-rc.2`, `bundle-schema@0.3.0-rc.2`. Byte-parity
verified against the mirrored `Aarmatix/avar-spec` build.

## 1.9.0-rc.1 — 2026-07-12

### Added — Phase 2B (Deterministic Replay primitives)
- Canonical `stepHash` / `entryHash` derivation exported so `aarmos
  replay --verify-chain` can reproduce chains without touching the
  original writer.
- Fixed missing `fflate` dependency and broken `.d.ts` emission that
  blocked downstream typed consumers of `@aarmos/avar-core`.

## 1.8.0-rc.2 — 2026-07-12

Coordinated bump only; no code changes vs `1.8.0-rc.1`.

## 1.8.0-rc.1 — 2026-07-11

### Added — Phase 2D (Scoped Tool Invites)
- **`signInvite(invite, privateKey)`** — detached ed25519 signature
  over canonical JSON (sorted keys, no whitespace).
- **`verifyInvite(token, { trustedKeys, now, connector })`** — offline
  verification: signature, `nbf` / `exp`, audience, connector match,
  scope ⊆ issuer grants (delegation attenuation invariant), optional Rekor anchor.
  Returns `{ ok, reason, scope, obligations }`.
- **`inviteBodyDigest`** — canonical digest helper reused by CLI and
  the bundle verifier so redemption records cross-reference by hash.
- WebCrypto path so verification runs unchanged in browsers and inside
  `@aarmos/avar-verify-wasm`.
- 12/12 crypto test suite (valid, expired, wrong audience, attenuation
  break, tampered payload, replay via caller-provided nonce store).

## 1.4.0 — 2026-07-13

Structural inclusion-proof check: recomputes the RFC 6962 leaf hash
from the stored Rekor entry body and walks the audit path to the
anchor's tree root. See `packages/cli/CHANGELOG.md` (0.11.0) for the
end-to-end story.
