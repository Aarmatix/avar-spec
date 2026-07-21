# RFC-0009: Producer Contract

**Status:** Draft
**Target:** AVAR 1.10
**License:** CC BY 4.0
**Depends on:** RFC-0008 (Evidence Model)

## 1. Scope

RFC-0008 defines what evidence *is*. This RFC defines what a compliant
producer MUST do to emit it.

## 2. Producer Requirements

A conforming producer MUST:

1. **Sign** every receipt with an Ed25519 keypair whose public key is
   discoverable via the mechanism in §4.
2. **Canonicalize** the receipt per RFC-8785 (JCS) before signing.
3. **Stamp** every evidence object with `depth`, `source`, and `claims`
   per RFC-0008 §3–§5.
4. **Chain** evidence via `prev_hash` when emitting multiple evidence
   objects for the same session.
5. **Declare** its own identity in the receipt header:
   ```json
   {
     "producer": {
       "name": "string",
       "version": "semver",
       "source": "one of RFC-0008 §4"
     }
   }
   ```
6. **Omit** fields it did not observe. It MUST NOT populate fields from
   assumptions or defaults.

## 3. Canonicalization

Producers MUST serialize receipts per RFC-8785 JSON Canonicalization Scheme
before signing. Verifiers MUST re-canonicalize before signature check.

Reserved characters, key ordering, and number representation follow RFC-8785
verbatim. This spec adds no deviations.

## 4. Key Discovery

Producers MUST publish their public key via one of:

- **DNS TXT** at `_avar-key.<producer-domain>` (recommended for network producers)
- **Well-known URL** at `https://<producer-domain>/.well-known/avar-key.json`
- **Inline** in the receipt header under `producer.public_key` (self-attesting,
  lower trust)

Verifiers MUST document which discovery mechanisms they support.

## 5. Time

Every receipt MUST include `issued_at` as RFC-3339 UTC with second precision.
Verifiers SHOULD reject receipts more than 24h in the future or more than
365d in the past unless configured otherwise.

## 6. Session Binding

Related evidence MUST share a `session_id` (UUIDv7 recommended). Producers
MUST NOT reuse `session_id` across unrelated agent actions.

## 7. Chaining

When emitting multiple evidence objects in the same session, each subsequent
evidence MUST include `prev_hash` = SHA-256 of the canonicalized prior
evidence. The first evidence in a session has `prev_hash: null`.

Verifiers MUST reject chains with hash mismatches (`E-CHAIN-BROKEN`).

## 8. Error Codes

- `E-SIG-INVALID` — signature verification failed
- `E-CANON-INVALID` — canonicalization mismatch
- `E-KEY-NOT-FOUND` — no discoverable public key for producer
- `E-CHAIN-BROKEN` — `prev_hash` does not match
- `E-TIME-OUT-OF-RANGE` — `issued_at` outside acceptable window
- `E-PRODUCER-MISSING` — no `producer` block in receipt header

## 9. Conformance

A producer is "AVAR 1.10 compliant" iff it passes the conformance suite
in `Aarmatix/avar-conformance` at the `producer/` test tier.
