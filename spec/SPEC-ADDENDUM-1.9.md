# SPEC-ADDENDUM-1.9 — Governance Provenance

- Status: Accepted
- Applies to: `avar/1.x` receipts (see SPEC.md §3)
- Related: SPEC-ADDENDUM-1.7 (Trust manifests), SPEC-ADDENDUM-1.8 (Authority predicate), ADR-0002 (No transitive trust), ADR-0003 (Authority identity stability), ADR-0004 (Reproducible verification)

> Historical note: this addendum was drafted internally as "Receipt
> Federation." The name was rejected — the design has no federation, no
> registry, no discovery service. "Governance Provenance" describes what
> the wire actually proves: which authority governed a run, and at
> which policy version.

## Summary

1.9 adds an OPTIONAL `governance` block to a receipt (`AvarEntry`) that
names the authority whose policy governed the execution and the exact
manifest sequence at which that policy was pinned. A third party holding
only the receipt bundle plus the authority's `trustmanifest/v1` envelope
can then reconcile "who governed this run" offline, without contacting
the operator, the authority, or Aarmos.

This is the wire form of the moat-v3 "Prove it, forever" tenet and the
canonical instance of ADR-0004 (Reproducible Verification): verification
is a pure function of `(receipt, manifests[])`.

## Predicate shape

```jsonc
// AvarEntry (additive; all fields OPTIONAL)
{
  "governance": {
    "authorityId": "aarmos://authority/<slug>",  // stable URI, SPEC-1.8 R1
    "manifestSequence": 3,                        // monotonic, SPEC-1.7
    "policyDigest": "sha256:<hex>",               // digest of the governing bundle
    "policyLabel": "starter/v1.4",                // OPTIONAL human aid
    "evidenceRef": "sha256:<hex>"                 // OPTIONAL, reserved for 2.x
  }
}
```

`policyDigest` is the SHA-256 of the canonical-JSON serialization of the
policy bundle that produced the decisions in this receipt. It is the
existing `AvarEntry.policyFingerprint` when set as a full SHA-256 hex, or
the digest of the policy source when the runtime records it separately.

`evidenceRef` is a forward-compatibility slot for future governance
evidence objects (approvals, waivers, exceptions). **Verifiers in 1.9
MUST ignore `evidenceRef`.** No `evidenceRef` object is defined in this
addendum; the field is reserved so 2.x can attach an immutable evidence
object without changing receipt semantics.

## Derived: Governance Fingerprint

Verifiers SHOULD compute and surface a `governanceFingerprint`: the
first 8 hex chars of

```
sha256( canonicalize({ authorityId, manifestSequence, policyDigest }) )
```

rendered as `GOV-<8hex>` (e.g. `GOV-9A4F1C2E`). This is a UI-only
compression — never stored on the wire, always recomputable — that lets
operators, auditors, and dashboards refer to one governance state with
one stable, human-legible id. Two receipts with the same
`governanceFingerprint` were governed identically.

## Verification rules

Verifiers gain three OPTIONAL hard reject codes and one advisory:

- `governance-authority-mismatch` — a manifest was supplied whose
  `authority.id` equals the receipt's `governance.authorityId` **but** the
  supplied manifest is signed by a different key than the manifest last
  accepted by that authority (issuer mismatch across sources).
- `governance-sequence-stale` — the supplied manifest for the receipt's
  authority is at `sequence < governance.manifestSequence` (the operator
  is trying to verify a newer receipt with an older manifest).
- `governance-policy-unlisted` — `governance.policyDigest` does not appear
  in the manifest's entries.
- `governance-unverified` (advisory) — receipt carries `governance` but no
  matching manifest was supplied. Verifier reports `valid-with-warnings`
  unless the caller opts into strict mode (`--fail-on-ungoverned`).

**GOV-1 (back-compat).** A receipt WITHOUT a `governance` block verifies
exactly as before, whether or not manifests are supplied. No forced
re-issuance.

**GOV-2 (single authority per receipt).** A receipt names at most one
governing authority. ADR-0002 stands — no transitive trust; verifiers do
not walk chains between authorities.

**GOV-3 (local-first, ADR-0004).** Verification is a pure function of
`(receipt, manifests[])`. Verifiers MUST NOT fetch. No registry lookup,
no discovery, no Aarmos-hosted service. The operator (or auditor) is
responsible for supplying the authority manifest they wish to verify
against.

**GOV-4 (multi-authority reports).** When multiple manifests are
supplied, the verifier matches each receipt to the manifest whose
`authority.id` equals `governance.authorityId`. Receipts whose authority
is not represented in any supplied manifest yield the
`governance-unverified` advisory (never a hard fail unless strict mode).

**GOV-5 (monotonic sequence at publish).** Manifest sequence MUST be
monotonically increasing at publish. Authoring tools (`aarmos authority
publish`) reject any sequence `<= last emitted` for a given authority.
Verifiers that maintain a local history (e.g. subscription state) MUST
reject any manifest whose sequence is lower than a previously accepted
manifest for the same authority (`rollback_rejected` from SPEC-1.7). This
addendum introduces no verifier-side history requirement; stateless
verifiers still verify each `(receipt, manifest)` pair on its own merit.

## Runtime obligations (non-normative)

The reference runtime stamps `governance` when the workspace has an
active governing authority (see `aarmos governance set <authority-uri>`,
shipping alongside this addendum). Absence of that config leaves
receipts unchanged — existing users see zero behavior change.

## Awe demo (upgraded)

Before 1.9: "signatures check, chain reconciles."

After 1.9 (the headline demo — drop-zone at `verify.aarmos.io`, no CLI,
no Aarmos install, no server): drop `receipt.avar` + `manifest.json` and
see

> ✓ Governed by **Acme Security Authority** · `GOV-9A4F1C2E` · policy `starter/v1.4` at manifest sequence 3

reproducible in 30 seconds by a stranger holding two files.
