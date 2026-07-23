# ADR-0004 — Reproducible Verification

- Status: Accepted (2026-07-15)
- Companions: ADR-0002 (No transitive trust), ADR-0003 (Authority identity stability), SPEC-ADDENDUM-1.9 (Governance Provenance)

## Context

Aarmos ships receipts (AVAR), authority manifests (SPEC-1.7 / 1.8), and
governance-chain metadata (SPEC-1.9). Each of these formats is a candidate
for a slow, silent drift: introducing a hosted registry, a discovery
endpoint, or an implicit "phone home" step that quietly makes the verifier
depend on live Aarmos infrastructure.

That drift would collapse the moat. The whole point of the artifacts is
that they are **testable evidence**, not access tokens to a hosted truth.

## Decision

**Every verification result Aarmos publishes MUST be derivable from
immutable artifacts alone, with no live infrastructure in the trust
path.**

Concretely:

1. Given the artifacts named by a verifier's public API — for example
   `(receipt, manifests[])` for `verifyGovernance`, or `(bundle)` for
   `verifyBundle` — the verdict is a pure function of the bytes on disk.
2. The reference verifier (`@avar-standard/core` / `@avar-standard/verify`, and any binary or
   browser bundle built from it) MUST NOT open a network socket, resolve
   DNS, or read process/user state to reach its verdict.
3. Optional live checks (Rekor consistency proof, transparency-log
   witnesses, etc.) MUST be:
   - opt-in behind an explicit flag (e.g. `--check-log`),
   - additive — never a prerequisite for the base verdict,
   - clearly labelled in output so an auditor can tell offline
     verdicts apart from live-attested ones.
4. Registry, discovery, "find-my-authority," and "which policy is
   current" services are forbidden in the verification path. They are
   acceptable as authoring conveniences that happen strictly *before*
   an artifact is signed.

## Consequences

- No hosted control plane can ever be a hard dependency of "did this
  receipt verify?" — including Aarmos's own infrastructure. Aarmos going
  dark does not invalidate a single receipt already in the world.
- Every new addendum ships with a two-file reproducibility test: hand a
  stranger the artifacts, they get the same verdict.
- Registrar-shaped features (marketplaces, indexed authority
  directories) live on separate surfaces and cannot leak into the
  verifier's I/O.
- Governance Fingerprints (SPEC-1.9) are derived, not stored — because
  a derived id is a byte-for-byte function of the artifacts and cannot
  drift from them.

## Alternatives considered

- **Optional registry lookups with a "trust-store" fallback.** Rejected:
  once a lookup exists, operators depend on it, and outages become
  verification outages. Contradicts the tenet directly.
- **Signed "current manifest pointer" served from `aarmos.io`.**
  Rejected: same failure mode. The publish-time monotonic-sequence rule
  (SPEC-1.9 G5) plus the subscription-side rollback rejection
  (SPEC-1.7) already solve freshness without live infrastructure.

## Enforcement

- Reviews of any new spec addendum or verifier PR MUST answer:
  *"Can a stranger holding only the named artifacts reproduce this
  verdict with no network?"* A "no" is a rejection.
- CI runs the `@avar-standard/*` test suites with network access
  denied (opt-in flags excepted).
