# ADR-0002 · No Transitive Trust — The Trust Invariant (T-INV)

- **Date:** 2026-07-15
- **Status:** DECIDED — Transitive trust (Track 5.1b) rejected. Subscribe URLs (5.1a) and CLI-driven refresh (5.1c) approved under the constraints below.
- **Owners:** Runtime + Access Model WG
- **Related:** `docs/avar/SPEC-ADDENDUM-1.6.md` (Trust Lists), `docs/avar/SPEC-ADDENDUM-1.7.md` (Trust Manifests, forthcoming), `mem://strategy/positioning-locked-v1`, `mem://strategy/marketing-and-moat`, `mem://product/moat`

## Context

Track 5.0 shipped signed trust lists: a workspace can export a `.trustlist.json` file containing publisher pins, and another workspace can verify and import them. Every entry is an explicit human decision.

Track 5.1 proposed three follow-ons:
- **5.1a — Subscribe URLs.** A trust list is fetched over HTTPS from a URL the operator explicitly chose. Content is still DSSE-signed and issuer-pinned; only the transport is remote.
- **5.1b — Transitive trust.** If Authority A signs a trust list that vouches for Authority B, then B's own trust lists become trusted automatically. A web of trust with derived edges.
- **5.1c — Auto-refresh.** Periodic re-fetch of subscribed lists (5.1a) with rollback protection.

The core question: does a governance runtime infer trust, or does it only record explicitly chosen trust?

## Decision

**Aarmos never derives trust. Every trusted authority is explicitly chosen by the operator, updates are monotonic, and trust state is reproducible from the on-disk manifest set alone.** This is the **Trust Invariant (T-INV)**.

Concretely:

1. **5.1b — Transitive Trust: REJECTED.** No signed statement from an already-trusted authority may add, remove, or modify the set of trusted authorities. Vouching statements are informational only — they may appear in `/trust/graph` as suggestions but never as active trust edges.
2. **5.1a — Subscribe URLs: APPROVED** under three constraints:
   - Each subscription is bound at creation time to a specific issuer fingerprint. Refreshes that arrive signed by a different key are rejected, not auto-rotated.
   - Refreshes replace the previous manifest only if `sequence` is strictly greater than the last accepted value from the same `authority.id`. Rollback attempts are rejected and surfaced.
   - The subscription record itself (URL + issuer fingerprint + last accepted sequence) is stored locally and is part of the reproducible trust state.
3. **5.1c — Auto-refresh: APPROVED for CLI/CI only.** `aarmos trust manifest refresh` is a foreground command suitable for cron and CI. No PWA background timers, no service-worker refreshers. The browser surfaces "N subscriptions, last refreshed T" and a manual "Refresh" button.

Vocabulary shift accompanying this ADR: what Track 5.0 called a **trust list** signed by a **publisher** is generalized in SPEC-ADDENDUM-1.7 into a **trust manifest** issued by a **trust authority**, with an `authority.id` + monotonic `sequence` for rollback protection. Existing `trustlist/v1` artifacts remain valid; `trustmanifest/v1` is the forward format.

## Consequences

**Positive**
- Preserves the Sovereign moat. Operators can reason about "who can affect my trust set" by reading one directory.
- Matches how mature ecosystems handle roots: Sigstore/SLSA distribute explicit trust roots; browser CA stores are curated allowlists. We are in good company by refusing web-of-trust semantics.
- Makes revocation tractable. A revoked authority stops mattering the moment its manifest is removed; there is no downstream graph to walk.
- Compatible with air-gapped and CI-only deployments: `refresh` is a command, not a daemon.

**Negative / accepted**
- Bootstrapping new publishers is a manual step per operator. This is intentional and matches the T1/T2 buyer's expectation (platform-eng, SRE, security).
- Multi-hop federation ("trust everything my industry consortium trusts") is not expressible in-product. If demand emerges, the consortium should publish a single curated manifest that each member subscribes to explicitly.

## Revisit triggers

Reopen only if **both** hold:
- ≥ 3 paying customers request derived trust with named use cases that cannot be served by a curated consortium manifest, AND
- We can specify bounded transitivity (fixed depth, per-edge scoping, mandatory expiry) that survives an external security review.

Absent both, do not relitigate.
