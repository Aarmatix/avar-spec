# SPEC-ADDENDUM-1.13 — Governance Recovery Points

- Status: Accepted
- Applies to: `avar/1.x` deployments (see SPEC.md §2, §3, §4)
- Related: 1.9 (Governance provenance), 1.10 (Cross-receipt lineage),
  1.11 (Chain closure), 1.12 (Governed Change)

## Summary

1.13 defines the **Governance Recovery Point (GRP)**: a signed, deterministic
summary that names the governance state a deployment can be recovered to.

The invariant:

> A Governance Recovery Point identifies, and never contains, the
> authoritative artifacts required to resume governed execution.

A GRP is derived state. Receipts, policies, and authorities remain
authoritative. Losing every GRP MUST NOT lose governance.

Verifiers that do not implement 1.13 are unaffected: GRPs are standalone
objects and do not change receipt, chain, or signature semantics.

## 1. Object

```json
{
  "kind": "aarmos-governance-recovery-point",
  "version": 1,
  "workspaceId": "ws_...",
  "refs": {
    "policyBundleHash": "<64 hex>",
    "authorityFrameVersion": "<string>",
    "identityVersion": "<string>",
    "receiptChainHead": "<64 hex>",
    "configurationDigest": "<64 hex>"
  },
  "identityDigest": "<64 hex>",
  "envelope": {
    "createdAt": "2026-08-02T00:00:00.000Z",
    "provenance": "manual",
    "changeSetId": "chg_...",
    "deviceFingerprint": "<string>",
    "devicePubKey": "<base64url>",
    "signature": "<base64url>"
  }
}
```

`refs` is a closed set. Implementations MUST reject unknown `refs` keys
rather than ignoring them; silent tolerance is how a reference object turns
into a container.

`provenance` is one of `manual`, `scheduled`, `automatic`, `pre-change`,
`post-change`. `changeSetId` is present only for `pre-change` and
`post-change`.

## 2. Identity digest

```text
identityBody   = { kind, version, workspaceId, refs }
identityDigest = SHA-256( canonicalize(identityBody) )   // §2 canonical JSON
```

The envelope is NOT part of the identity digest. Two GRPs with equal
identity digests describe the same governance state regardless of when,
where, why, or by whom they were created. Implementations MAY deduplicate
on the identity digest and retain multiple envelopes for one state.

## 3. Signature

The envelope signature is Ed25519 over canonical JSON of:

```text
signedBody = { identityDigest, createdAt, provenance, changeSetId?,
               deviceFingerprint }
```

`signature` and `devicePubKey` are excluded from the signed body, per the
same rule as receipt entries (SPEC.md §3.2).

## 4. Prohibited content

A GRP MUST NOT contain:

- receipt bodies, policy bodies, or authority documents (references only)
- API keys, tokens, private key material, or connector credentials
- any field whose size grows with the number of receipts

Connector *identities* are in scope via `configurationDigest`; connector
*credentials* are not. Restore re-authorizes credentials.

## 5. Configuration digest

`configurationDigest` is SHA-256 over canonical JSON of the
governance-relevant, locally-resolvable configuration: sink targets,
redaction rules, routing rules, and connector identities. Server-held
configuration MUST NOT contribute to it — a recovery path that requires the
control plane is not a recovery path.

## 6. Verification

Verification is a pure function of `(recoveryPoint, artifacts)`. It MUST
NOT read a clock, perform network I/O, or depend on input ordering.

A verifier reports, per component:

| Component | Verified when |
| --- | --- |
| Policy | Available policy bundle hashes to `refs.policyBundleHash` |
| Authority | Authority frame at `refs.authorityFrameVersion` resolves |
| Identity | Identity state at `refs.identityVersion` resolves |
| Receipts | Chain head equals `refs.receiptChainHead` and the chain verifies |
| Configuration | Recomputed digest equals `refs.configurationDigest` |
| Replay | Replay of the recovered chain reproduces recorded decisions |

Outcome is a state, never a score:

- `Complete` — every component above verified.
- `Incomplete` — at least one component unverified; the report MUST name
  every unverified component.

## 7. Error codes

| Code | Meaning |
| --- | --- |
| `GRP_WRONG_KIND` | `kind` is not `aarmos-governance-recovery-point` |
| `GRP_UNSUPPORTED_VERSION` | `version` is not 1 |
| `GRP_MALFORMED` | required field missing or wrong type |
| `GRP_UNKNOWN_REF` | unrecognized key inside `refs` |
| `GRP_FORBIDDEN_FIELD` | secret-shaped or content-bearing field present |
| `GRP_DIGEST_MISMATCH` | `identityDigest` does not match recomputation |
| `GRP_SIGNATURE_INVALID` | envelope signature does not verify |

## 8. Non-goals

- A GRP is not a backup. It carries no recoverable data by itself.
- A GRP is not an availability guarantee. It says what state exists, not
  where copies live.
- A GRP does not establish inclusion proofs for individual receipts. The
  chain head is a linear hash-chain head; batch inclusion proofs would
  require a Merkle root, which this addendum deliberately does not adopt.
