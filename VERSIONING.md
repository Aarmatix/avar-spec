# AVAR Versioning

**License:** CC BY 4.0

## Scheme

AVAR versions follow Semantic Versioning 2.0.0 with the following
domain-specific rules.

## What Counts as a Breaking Change (MAJOR)

Any of the following require a MAJOR version bump:

- Removing a receipt field
- Changing the type of an existing field
- Changing canonicalization rules
- Changing signature algorithm defaults
- Any change that causes a previously-valid receipt to be rejected by a
  conforming verifier at the same version tier

## What Counts as a Feature (MINOR)

- Adding an OPTIONAL receipt field
- Adding a new value to an open enum (e.g., new `source` per RFC-0008 §4)
- Adding a new `depth` level (see below)
- Adding a new error code
- Adding a new discovery mechanism (RFC-0009 §4)

New `depth` values are MINOR because RFC-0008 §3 requires verifiers to
accept unknown values with warnings, not rejection.

## What Counts as a Fix (PATCH)

- Editorial changes, typos, clarifying prose
- Non-normative example fixes
- Test vector additions that assert already-specified behavior

## Additive-Fields Policy

Producers MAY emit fields not defined in the current AVAR version. Verifiers
MUST ignore unknown fields. This allows producers to prototype extensions
before RFC acceptance.

## Deprecation

A field may be deprecated in a MINOR release. Deprecated fields:

- MUST remain valid for at least one additional MAJOR version
- MUST be listed in the changelog with removal target version
- SHOULD emit verifier warnings when present

## Compatibility Statement

Every AVAR release ships with an explicit compatibility statement listing:

- Highest prior version whose receipts remain valid
- Any producer behavior changes
- Any verifier behavior changes

## Conformance Tier Versioning

The conformance suite (`Aarmatix/avar-conformance`) tracks AVAR versions
independently. Suite version `X.Y.Z` MAY be released to test spec version
`X.Y` — patch bumps of the suite reflect test improvements, not spec changes.

## Reserved Fields

Fields prefixed `x-` are reserved for producer-private extensions and MUST
NOT be standardized. Fields prefixed `_` are reserved for future spec use;
producers MUST NOT emit them.
