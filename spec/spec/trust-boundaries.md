# SPEC-ADDENDUM-1.15 — Trust boundaries: declared data contracts and authority-bound credentials

- Status: Accepted
- Date: 2026-08-03
- Wave: 16 (Trust Boundaries)
- Spec id: `avar/trust-boundary/1.0`
- Related: ADR-0001 (no TLS interception), ADR-0004 (reproducible
  verification), ADR-0009 (classification axis), ADR-0010 (authority-bound
  credentials)

This addendum defines two artifact families. Both are verifiable offline
from bytes alone, and neither ever carries payload material.

## 1. Declared data contracts

A workload declares the *shape* of what it sends or receives. Nothing is
inferred and nothing is inspected.

```json
{
  "spec": "avar/trust-boundary/1.0",
  "workload": "billing-agent",
  "purpose": "reconcile invoices",
  "direction": "sends",
  "fields": [
    { "name": "customer_id", "classification": "internal" },
    { "name": "invoice_total", "classification": "confidential" }
  ]
}
```

`classification` MUST be one of `public`, `internal`, `confidential`,
`restricted` (ADR-0009).

### 1.1 Commitment

```
commitment = "sha256:" || hex(SHA-256(canonical(body)))

body = {
  spec:      "avar/trust-boundary/1.0",
  workload:  <string>,
  purpose:   <string>,
  direction: "sends" | "receives",
  fields:    <fields sorted ascending by name, each reduced to
              { name, classification }>
}
```

`canonical()` is AVAR canonical JSON (SPEC section 2). Field order in the source
declaration is not significant. The commitment input is names,
classifications, purpose and direction only — values cannot enter it by
construction.

A receipt MAY carry `contractCommitment`. It MUST NOT carry field values.

### 1.2 Undeclared fields

Observed field names absent from the declaration are reported as
undeclared. A call with one or more undeclared fields earns coverage level
`unobserved`. Absence of a declaration is recorded, never treated as clean.

## 2. Authority-bound credentials

Per ADR-0010, the runtime binds; it never handles secret material.

Normative: an implementation of this addendum **MUST NOT** receive, forward,
escrow, persist, proxy, or terminate customer credentials. Only public
identifiers enter the commitment. An implementation that transports secret
material — even transiently, even in memory — is not conformant with
`avar/trust-boundary/1.0`.

```json
{
  "spec": "avar/trust-boundary/1.0",
  "context": {
    "principal": "aarmos://authority/billing",
    "purpose": "reconcile invoices",
    "resources": ["api.stripe.com"],
    "capability": "read",
    "classificationCeiling": "confidential",
    "policyHash": "sha256:…",
    "latticeVersion": "1.0",
    "notBefore": 1754200000000,
    "notAfter": 1754200900000
  },
  "credentialCommitment": "sha256:…",
  "issuer": "vault://prod",
  "signature": "<base64url Ed25519>",
  "publicKey": "<base64url raw>"
}
```

### 2.1 Credential commitment

```
credentialCommitment = "sha256:" || hex(SHA-256("avar-credential-id\n" || publicIdentifier))
```

`publicIdentifier` MUST be a public reference — a key id, ARN, or token id.
Secret material MUST NOT be passed. Implementations MUST NOT persist the
input.

### 2.2 Signed body

```
signedBody = {
  spec:                 "avar/trust-boundary/1.0",
  context:              <context with `resources` sorted ascending>,
  credentialCommitment: <string>,
  issuer:               <string>
}
```

Signature is Ed25519 over `utf8(canonical(signedBody))`.

### 2.3 Verdicts

| Verdict | Condition |
| --- | --- |
| `malformed` | required fields missing or wrongly typed |
| `signature_invalid` | signature does not verify over the canonical body |
| `credential_mismatch` | presented public identifier does not match the commitment |
| `not_yet_valid` | `now < notBefore` |
| `expired` | `now >= notAfter` |
| `valid` | all checks pass |

Evaluation order is exactly: shape, signature, credential match, window.
Verification takes `now` as an input so a verdict is a function of the
artifacts plus a stated instant. Verification MUST NOT require network
access or any vendor-hosted service.

A relying party that cannot verify a binding at all MUST fail closed and
record an `unverified_binding` disclosure at coverage level `unobserved`.

## 3. Conformance

An implementation conforms when, for the same artifacts and the same
`now`, it produces the same commitment strings and the same verdicts as the
reference implementation in `@avar-standard/core`
(`packages/avar-core/src/boundary.ts`) and its WASM mirror
(`packages/avar-verify-wasm/src/verify-boundary.mjs`). Parity is enforced
in CI with network access denied.
