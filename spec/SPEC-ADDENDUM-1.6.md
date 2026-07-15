# SPEC ADDENDUM 1.6 — Signed Trust Lists (Track 5.0)

Status: **Ships in `@aarmos/cli@0.38.0`, browser 2026-07-15.**
Depends on: SPEC-ADDENDUM-1.5 §Track 4.0 (DSSE envelope, in-toto Statement).

## Motivation

Track 4.x let a workspace sign artifacts and let another workspace verify
them, but every device still had to pin publishers by hand. A trust list
turns that per-device chore into a distributable artifact: one signed
`.trustlist.json` file that says "these are the publishers I vouch for."

## Wire format

Trust lists reuse the **DSSE envelope** from Track 4.0 (`attest/1.0`,
`payloadType: application/vnd.in-toto+json`). The only new wire is the
`predicateType`:

```
https://aarmos.io/attestations/trustlist/v1
```

The in-toto **Statement** carries:

```jsonc
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [{
    "name": "trustlist:<digest12>",
    "digest": { "sha256": "<hex of canonical(entries)>" }
  }],
  "predicateType": "https://aarmos.io/attestations/trustlist/v1",
  "predicate": {
    "kind": "trustlist",
    "publisher": { "fingerprint": "…", "publicKey": "<b64 raw ed25519>" },
    "issuedAt": "2026-07-15T00:00:00Z",
    "expiresAt": "2027-07-15T00:00:00Z",   // optional
    "entries": [
      { "fingerprint": "…", "publicKey": "…", "label": "…", "notes": "…" }
    ]
  }
}
```

### Deterministic entries digest

Both CLI and browser normalize entries the same way before hashing:

1. Trim + lowercase every `fingerprint`, reject anything not
   `/^[a-f0-9]{6,64}$/`.
2. Drop duplicate fingerprints (first-write-wins).
3. Drop empty `label` / `notes`.
4. Sort ascending by `fingerprint`.
5. Canonicalize as `{"entries":[…]}` with **sorted keys, no whitespace**.
6. `sha256(canonical(utf8))` → hex → subject digest.

Any drift here is a parity bug and MUST break
`tests/guardrails/trustlist-parity.test.ts`.

## CLI surface

```
aarmos trust list export <out> [--publisher <name>] [--expires <iso>]
aarmos trust list verify <file>
aarmos trust list import <file> [--apply]
```

- Export sources entries from `.aarmos/trust/pinned-publishers.json`.
- Import verifies + prints a diff. `--apply` merges into local pins.
  Never removes existing pins.

## Browser surface

- `/trust/verify` auto-routes `.attest.json` files whose predicate is
  `trustlist/v1` to the trust-list report card.
- Report card shows issuer, issued/expires, and a diff of "new" vs
  "already pinned." One click adds the new entries to
  `localStorage[aarmos.trust.pinned-publishers.v1]`.

## Verification rules

An envelope is `ok` iff **all** of:

1. DSSE Ed25519 signature verifies over PAE(payload) with the issuer key
   embedded in `predicate.publisher.publicKey`.
2. `predicateType === "https://aarmos.io/attestations/trustlist/v1"`.
3. `predicate.kind === "trustlist"` and `entries` is a non-empty array.
4. Recomputed subject digest (via the canonicalization rules above) is
   present in `statement.subject[*].digest.sha256`.
5. `expiresAt` is either absent or in the future.

Failure codes: `ATTEST_SIG_INVALID`, `TRUSTLIST_WRONG_PREDICATE`,
`TRUSTLIST_MALFORMED`, `TRUSTLIST_SUBJECT_MISMATCH`, `TRUSTLIST_EXPIRED`.

## Out of scope (Track 5.1)

- HTTP subscription / registry fetch (`aarmos trust list subscribe <url>`).
- Transitive web-of-trust.
- Auto-refresh / rotation.
- `--replace` semantics (destructive pin overwrite).
