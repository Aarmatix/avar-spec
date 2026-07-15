# AVAR Spec Addendum 1.4 — Producer origin (additive)

**Status:** Additive, forward-compatible. Verifiers that don't know about `origin` MUST include it in canonical JSON per §2 and MUST NOT reject entries that contain it.

## Motivation

Once a receipt leaves the runtime that produced it, we lose all context about which build emitted it. This is a problem for:

- **Enterprise customers** — they want to prove a receipt in an audit came from a genuine Aarmos build, not a forked runtime.
- **Support triage** — knowing the producing release cuts diagnosis time.
- **Brand integrity** — a receipt claiming to be "Aarmos" but produced by a fork should be identifiable.

## The `origin` field

Optional top-level field on every `AvarEntry`:

```jsonc
{
  // ... standard avar/1.x fields ...
  "origin": {
    "release": "3.8.0",             // required if the block is present
    "releaseSig": "a1b2c3d4…",      // first 16 hex of the release manifest sig
    "builderPubkey": "e5f6a7b8…"    // SHA-256 prefix of the release-signer pubkey
  }
}
```

### Semantics

- **Absent `origin`** — no producer claim. Valid, but unattributable.
- **Present `origin`** — the producer *claims* to be a specific build. Verifiers with a pinned list of Aarmos release signers can classify the receipt as `aarmos-origin`, `unrecognized-origin`, or `no-origin`.
- **Never a gating field.** A receipt without `origin` still passes chain verification. `origin` answers "who produced this?", not "is this cryptographically sound?".

## Verifier behavior

- `avar verify` unchanged by default — `origin` is opaque data.
- `avar verify --origin` prints the origin block if present.
- `avar verify --require-origin=aarmos` exits non-zero if the receipt's `builderPubkey` doesn't match a pinned Aarmos signer.

## Canonicalization

`origin` participates in canonical JSON per §2 exactly like any other object field. No special-casing.

## Non-goals

- No PII in `origin` — release identifier and signer fingerprints only.
- No tenant / user identifier — that's a separate ABAC surface.
- No enforcement in the policy gate — origin is a producer claim, not a runtime decision.
