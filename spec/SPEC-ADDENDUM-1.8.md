# SPEC-ADDENDUM-1.8 — Authority-shaped trust manifests

- Status: Accepted
- Applies to: `trustmanifest/v1` predicate (see SPEC-ADDENDUM-1.7)
- Related: ADR-0003 (Authority identity stability), ADR-0002 (No transitive trust)

## Summary

1.8 formalizes the **Authority** as the stable trust referent inside a
`trustmanifest/v1` DSSE envelope. The wire format is a superset of 1.7 —
existing 1.7 manifests continue to verify unchanged.

## Predicate shape (v1.8)

```jsonc
{
  "kind": "trustmanifest",
  "authority": {
    "id": "aarmos://authority/<slug>",   // stable URI, see ADR-0003
    "displayName": "Aarmatix Starter",   // OPTIONAL, human-readable
    "homepage": "https://aarmos.io/…",   // OPTIONAL, https:// URL
    "contact":  "security@…",            // OPTIONAL, mailto or URL
    "label":    "…",                     // legacy 1.7 alias for displayName
    "fingerprint": "<12-hex>",           // current signing key fingerprint
    "publicKey":   "<base64 raw ed25519>"
  },
  "publisher": { "fingerprint": "…", "publicKey": "…" },  // mirrors authority
  "sequence":   3,
  "issuedAt":   "2026-07-16T12:00:00Z",
  "expiresAt":  "2027-01-01T00:00:00Z",  // OPTIONAL
  "entries":    [ { "fingerprint": "…", "label"?: "…", "notes"?: "…" }, … ]
}
```

The subject digest is unchanged from 1.7 —
`sha256(canonical({ entries: sorted-normalized }))` — so entry tampering
still trips `subject_mismatch` regardless of the metadata block.

## New / clarified rules

- **R1 — Stable ID form.** New manifests issued by `aarmos authority
  publish` MUST set `authority.id` to `aarmos://authority/<slug>` where
  `<slug>` matches `^[a-z0-9](-?[a-z0-9])*$` and is 1–63 chars.
- **R2 — Legacy IDs still verify.** Verifiers MUST accept any string in
  `authority.id`. Operators upgrading from 1.7 keep working subscriptions;
  re-issuing under 1.8 is a routine sequence bump.
- **R3 — Key is an attribute.** `authority.fingerprint` /
  `authority.publicKey` describe the *current* signing key. Rotation
  changes them; `authority.id` does not.
- **R4 — Subscriber pinning.** A subscription MUST pin the pair
  `(authority.id, authority.fingerprint)`. Refresh continues to reject
  `authority_mismatch`, `issuer_mismatch`, `rollback_rejected`, and
  `expired` per 1.7. This addendum does not add new reject codes.
- **R5 — Metadata is descriptive, not authoritative.** `displayName`,
  `homepage`, `contact` are for humans. They MUST NOT be used to make
  trust decisions or to route verification.

## Back-compat

- 1.7 manifests: verify unchanged. `authority.id` is treated as opaque.
- 1.8 manifests read by a 1.7 verifier: verify unchanged (unknown fields
  ignored). No wire break.

## Non-normative — issuing side

The reference CLI (`aarmos authority`) validates R1 at issue time. Manifest
subscribers do not enforce R1 — enforcing it would break existing 1.7 pins
and violate R2.

## Reserved for future addenda

- Signed rotation events (subscriber-side auto-rotation without operator
  re-pin) — not in 1.8.
- Cross-authority delegation — explicitly out of scope (ADR-0002).
