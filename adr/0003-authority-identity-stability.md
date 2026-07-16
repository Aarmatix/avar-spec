# ADR-0003 — Authority identity stability

- Status: Accepted
- Date: 2026-07-16
- Supersedes: —
- Related: ADR-0002 (No transitive trust), SPEC-ADDENDUM-1.7 (Trust manifests), SPEC-ADDENDUM-1.8 (Authority predicate)

## Context

The trust-manifest addendum shipped `trustmanifest/v1`: a DSSE-signed publisher list an
operator subscribes to. Verification binds a subscription to the
fingerprint of the **key** that signed the first accepted manifest. That
works, but conflates two orthogonal things:

1. **Who** the trust root is (durable — a policy authority such as
   "Aarmatix Starter", a customer's platform team, an industry body).
2. **Which key** that root is currently using to sign (rotatable — an
   Ed25519 keypair on somebody's laptop or HSM).

If we treat the key as the identity, every legitimate rotation looks like
a compromise: subscribers see `issuer_mismatch` and must re-subscribe from
scratch, losing sequence state. Planned receipt-federation work will
reference these roots by name in receipts; that reference has to survive
routine rotations or the audit trail breaks.

## Decision

An **Authority** is identified by a stable URI, not by a signing key.

```
aarmos://authority/<slug>
    slug ::= [a-z0-9](-?[a-z0-9])*      # DNS-label-ish, 1–63 chars
```

- The URI is the durable referent used in trust manifests, receipts, pins,
  and subscription state.
- A signing key is an **attribute** of an Authority (`authority.key`), not
  its identity. Rotation replaces the attribute, not the identity.
- Subscribers pin `(authority.id, current key fingerprint)`. Rotation is
  accepted only when the new manifest is signed by the *previously pinned*
  key attesting the new key (rotation-event handling lives in a future
  addendum; today, rotation requires operator re-pin).
- 1.7-shape manifests (opaque `id` such as `urn:aarmos:authority:acme`)
  continue to verify. New manifests issued by `aarmos authority` MUST use
  the `aarmos://authority/<slug>` form.

## Consequences

**Pros**
- Rotating a signing key never invalidates a receipt reference to an
  authority.
- Human-readable metadata (`displayName`, `homepage`, `contact`) can hang
  off the stable ID without polluting the key material.
- 6.0 receipt federation gets a durable name to reference.

**Cons**
- Two things (`id` and `key`) instead of one. Operator UI must show both.
- URI scheme is Aarmos-specific; not a W3C DID. We deliberately avoid the
  DID stack to keep the substrate small — DIDs remain an option later if
  ecosystem pressure emerges.

## Alternatives considered

- **Key-as-identity (status quo)** — rejected. Rotation = re-subscribe.
- **DID / did:web** — rejected for v1. Extra spec surface, extra
  dependencies, and no material benefit until we federate outside our own
  substrate.
- **DNS-anchored (`https://…/authority.json`)** — the URL of the manifest
  is already the transport; conflating it with the identity re-couples key
  location and identity. Kept separate.

## Non-goals

- Transitive trust between authorities (ADR-0002 stands).
- Third-party discovery / registry. Roots remain explicit operator choice.
- Browser-side authority publishing. Authoring stays CI/Git-driven.
