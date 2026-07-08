# Governance

`@aarmos/avar-core` is the reference implementation of the AVAR
(Aarmos Verifiable Action Record) specification.

## Spec stewardship

Aarmatix LLC is the steward of the `avar/1.x` specification. Version
bumps to the wire format, canonical-JSON rules, hash-chain semantics,
and signature envelope require review by the steward.

Third-party implementations are welcome and encouraged. They must
identify themselves as an `avar/1.x` implementation only if they pass
the golden fixture suite in [`test/fixtures/`](./test/fixtures/).

## Verifier code (this package)

The verifier code is Apache-2.0 licensed (see [`LICENSE`](./LICENSE)
and [`NOTICE`](./NOTICE)). Apache-2.0 was chosen over MIT for the
explicit patent grant — AVAR is a proof primitive that downstream
implementers must be able to depend on without patent risk. Bug fixes,
portability improvements, performance work, and additional test
fixtures are welcome via pull request. Please open an issue first for
anything larger than a bug fix
so we can align on scope.

## Spec changes

Changes to `avar/1.x` (new required fields, changed canonicalization,
new hash inputs, revised signature envelope) go through an RFC in this
repository. Non-breaking additions (new optional metadata fields, new
verifier warnings) can land after review; breaking changes require a
major version bump and coordinated release with existing implementers.

The intent is deliberate: AVAR is a proof primitive. Silent format
drift would defeat the "verifiable, forever" property the spec exists
to provide.

## Anti-goal

We will not accept changes that make bundles produced by one
`avar/1.x` implementation unverifiable by another. Interop is the
whole point.
