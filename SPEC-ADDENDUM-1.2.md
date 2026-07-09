# AVAR Spec Addendum — Cross-Party Receipt Binding (`avar/1.2`)

**Status:** Additive. Fully back-compatible with `avar/1.0` and `avar/1.1`.
Verifiers unaware of this addendum MUST continue to treat `parentReceipt`
as opaque data included in canonical JSON per §2 (Canonicalization).

## Motivation

`avar/1.0` binds `parentTraceId` and `delegationChain` inside a single
trust boundary (one Aarmos runtime, one device key). When autonomous
agents delegate ACROSS boundaries — Aarmos node A calls Aarmos node B
over A2A, MCP-remote, OpenAPI, or a custom protocol — no cryptographic
link ties B's receipt back to A's. Auditors cannot prove the two runs
belong to the same execution.

`avar/1.2` closes this gap by pinning the caller's finalized `entryHash`
inside the callee's receipt. The pin is opaque, small, and requires no
coordination beyond a single HTTP header on the outbound call.

## Wire Format

Callers MAY set the following header on any outbound protocol invocation:

```
x-avar-parent-receipt: <base64url(JSON({hash, issuer?, traceId?, protocol?}))>
```

The JSON object has the following shape:

| Field      | Type   | Required | Description                                                        |
|------------|--------|----------|--------------------------------------------------------------------|
| `hash`     | string | yes      | SHA-256 hex of the caller's canonical entry bytes (`entryHash`).   |
| `issuer`   | string | no       | Caller's device / key fingerprint (short pubkey fingerprint).       |
| `traceId`  | string | no       | Caller's traceId for human readability. Not a trust anchor.         |
| `protocol` | string | no       | `a2a` \| `mcp` \| `openapi` \| `custom`. Advisory tag.              |

Recipients MUST:
- Ignore the header if malformed (bad base64url, non-JSON, missing `hash`).
- Cap `hash` at 256 chars, `issuer` / `traceId` at 128, `protocol` at 32.
- Never dispatch or execute a tool based solely on header contents.

## Receipt Field

The recipient's finalized `AvarEntry` MAY carry:

```json
"parentReceipt": {
  "hash": "…",
  "issuer": "…",
  "traceId": "…",
  "protocol": "a2a"
}
```

The field is optional and additive. Its bytes are included in canonical
JSON per §2, so the entry's `entryHash` and signature cover the parent
pin — a callee cannot alter its claimed parent post-hoc without breaking
its own chain.

## Verification

A cross-party auditor holding entries from both sides reconciles a pair as
follows:

1. Verify each entry independently per §5 (Signature) and §6 (Chain).
2. For a candidate pair `(local, peer)` where `local.parentReceipt` is present:
   - `local.parentReceipt.hash === peer.entryHash` MUST hold.
   - If both `local.parentReceipt.issuer` and `peer.deviceFingerprint` are
     present, they MUST match.
3. If step 2 passes, the two entries are **cryptographically bound**: the
   callee attests to executing on behalf of the caller's specific finalized
   run, and neither can be edited without breaking a signature or a chain.

Reference implementation: `src/lib/avar/cross-receipt.ts` exports
`receiptRef`, `encodeParentReceipt`, `decodeParentReceipt`, and
`verifyParentBinding`. `avar diff` will surface cross-party mismatches
under a `cross-receipt` category in a future release.

## Failure Modes and Non-Goals

- **Not authentication.** The header is advisory; a hostile peer can
  fabricate any `hash`. The cryptographic binding only exists when the
  auditor holds BOTH signed entries and can verify them independently.
- **Not authorization.** The recipient's policy gate still runs in full.
  `parentReceipt` never widens the callee's authority.
- **Not confidentiality.** The header leaks only the caller's entryHash
  (already public inside the caller's audit trail) and optional pubkey
  fingerprint. It does not leak payload, args, or user identity.
- **Not required.** Peers that do not speak AVAR simply drop the header.
  Local receipts remain fully valid; only the cross-party link is absent.

## Compatibility

- `avar/1.0` verifiers: no impact. `parentReceipt` is opaque data.
- `avar/1.1` verifiers: no impact. `parentReceipt` is opaque data.
- `avar/1.2` verifiers: MAY surface cross-party reconciliation in `diff`.
- All existing bundles remain verifiable unchanged.
