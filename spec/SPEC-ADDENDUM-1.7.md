# SPEC ADDENDUM 1.7 — Trust Manifests & Subscriptions (Track 5.1a / 5.1c)

Status: **DRAFT — implementation gated on ADR-0002 acceptance.**
Depends on: SPEC-ADDENDUM-1.5 §Track 4.0 (DSSE + in-toto Statement), SPEC-ADDENDUM-1.6 (Signed Trust Lists).
Governs: `trustmanifest/v1` wire format, subscription records, refresh semantics.
Governed by: **ADR-0002 · The Trust Invariant (T-INV)** — no derived trust; explicit choice; monotonic updates; reproducible state.

## Motivation

Track 5.0 (`trustlist/v1`) is a one-shot artifact: export a signed list, import it once, done. Real deployments need a way to say "keep this list fresh" without letting the network silently expand the trust set.

Addendum 1.7 introduces two changes:

1. A **trust manifest** — the same DSSE + in-toto shape as a trust list, plus versioning fields (`authority.id`, `sequence`, `issuedAt`, `expiresAt?`) that make refreshes safe.
2. A **subscription record** — a locally stored, operator-authored tuple that binds a URL to a specific issuer fingerprint and remembers the last accepted `sequence`.

`trustlist/v1` remains valid. `trustmanifest/v1` is the forward format for anything that will be refreshed.

## Wire format

Trust manifests reuse the **DSSE envelope** from Track 4.0
(`payloadType: application/vnd.in-toto+json`). The new `predicateType` is:

```
https://aarmos.io/attestations/trustmanifest/v1
```

The in-toto **Statement** carries:

```jsonc
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [{
    "name": "trustmanifest:<authority.id>@<sequence>",
    "digest": { "sha256": "<hex of canonical(entries)>" }
  }],
  "predicateType": "https://aarmos.io/attestations/trustmanifest/v1",
  "predicate": {
    "kind": "trustmanifest",
    "authority": {
      "id": "<stable opaque id, e.g. urn:aarmos:authority:acme-security>",
      "label": "ACME Security",
      "fingerprint": "<ed25519 fingerprint of the signing key>",
      "publicKey": "<b64 raw ed25519>"
    },
    "sequence": 42,
    "issuedAt": "2026-07-15T00:00:00Z",
    "expiresAt": "2027-07-15T00:00:00Z",   // optional; verifiers MUST reject if past
    "entries": [
      {
        "fingerprint": "<publisher fingerprint>",
        "publicKey": "<b64 raw ed25519>",
        "label": "Platform Team",
        "notes": "…"
      }
    ]
  }
}
```

Canonicalization: JCS (RFC 8785) over `predicate.entries` for the subject
digest, matching `trustlist/v1`. Signature is DSSE PAE over the full Statement.

### Field semantics

- `authority.id` — stable opaque identifier chosen by the issuer. It is the join key across refreshes. It is **not** a URL and **not** a fingerprint.
- `authority.fingerprint` / `authority.publicKey` — the key the operator pinned at subscription time. **Refreshes MUST verify with the pinned key.** A signature by a different key is rejected — never auto-rotated. Key rotation is an out-of-band re-subscribe.
- `sequence` — strictly monotonic per `authority.id`. Verifiers MUST reject `sequence ≤ last_accepted_sequence` for that authority.
- `issuedAt` / `expiresAt` — informational timestamps; `expiresAt` when present is enforced.
- `entries` — the same publisher records as `trustlist/v1`. Removing an entry in a later `sequence` revokes the pin.

## Subscription record

Stored locally (CLI: `~/.aarmos/trust/subscriptions.json`; Browser: IndexedDB `aarmos-trust/subscriptions`). Not signed; part of the operator's local state.

```jsonc
{
  "id": "<uuid>",
  "url": "https://acme.example.com/aarmos/trust.manifest.json",
  "authorityId": "urn:aarmos:authority:acme-security",
  "issuerFingerprint": "<ed25519 fingerprint pinned at create>",
  "lastAcceptedSequence": 42,
  "lastAcceptedAt": "2026-07-15T00:00:00Z",
  "lastCheckedAt": "2026-07-15T01:00:00Z",
  "lastError": null,
  "createdAt": "2026-07-01T00:00:00Z"
}
```

## Refresh algorithm

Input: subscription record `S`, freshly fetched envelope `E`.

1. DSSE-verify `E` using `S.issuerFingerprint`. On failure → reject, set `lastError`, do not touch `lastAcceptedSequence`.
2. Parse Statement. Require `predicateType == trustmanifest/v1` and `predicate.authority.id == S.authorityId`. Reject on mismatch.
3. Require `predicate.authority.fingerprint == S.issuerFingerprint`. Reject on mismatch. (Defense in depth against a matching-key/different-authority mixup.)
4. Require `predicate.sequence > S.lastAcceptedSequence`. Reject on equal or lower — surface as `rollback_rejected`.
5. If `predicate.expiresAt` is present and in the past → reject as `expired`.
6. Apply: replace the pin set for this `authorityId` with `predicate.entries`. Update `S.lastAcceptedSequence`, `S.lastAcceptedAt`.

All rejects are non-destructive: the previously accepted entries and sequence stand.

## CLI surface (Track 5.1a / 5.1c)

- `aarmos trust manifest subscribe <url> --issuer <fingerprint> [--label <name>]`
- `aarmos trust manifest list`
- `aarmos trust manifest refresh [--id <sub-id> | --all]` — foreground; cron/CI safe; non-zero exit on any reject.
- `aarmos trust manifest unsubscribe <sub-id>` — removes the subscription **and** the entries it contributed.
- `aarmos trust manifest inspect <sub-id>` — shows pinned issuer, last sequence, current entries.

No background daemon. No `--watch` flag.

## Browser surface

`/trust/graph` gains a **Subscriptions** card:

- Rows: label, authority id, pinned fingerprint (truncated), last sequence, last refreshed.
- Actions: **Refresh** (per-row and "Refresh all"), **Unsubscribe**, **Copy authority id**.
- Rejects render an inline red note with the reason (`rollback_rejected`, `sig_mismatch`, `expired`, `authority_mismatch`). No auto-retry.

No service worker refresh. No background timers.

## What this addendum deliberately does **not** allow

Per **ADR-0002 (T-INV)**:

- No transitive trust. A trust manifest MUST NOT vouch for another authority as a first-class trust edge. An entry whose `fingerprint` happens to also be another authority's signing key is treated as a publisher pin only.
- No key auto-rotation over the wire. Rotating a compromised or expired issuer is a re-subscribe by the operator.
- No implicit subscription discovery. URLs are pasted or scripted; they are never advertised from within an existing manifest.

## Backwards compatibility

- `trustlist/v1` (Addendum 1.6) verifiers continue to accept unchanged artifacts.
- A `trustmanifest/v1` artifact with `sequence: 1` and no `expiresAt` is semantically equivalent to a `trustlist/v1` snapshot for the purpose of one-shot import.
- Guardrail parity test extends `tests/guardrails/trustlist-parity.test.ts` with manifest fixtures; CLI and browser verifiers MUST agree on accept/reject and on the rejection reason string.
