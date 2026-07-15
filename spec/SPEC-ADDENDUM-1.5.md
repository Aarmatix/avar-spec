# AVAR Spec Addendum 1.5 — Agent identity (additive)

**Status:** Additive, forward-compatible. Verifiers that don't know about
`agentIdentity` MUST include it in canonical JSON per §2 and MUST NOT reject
entries that contain it.

## Motivation

`avar/1.4` (`origin`) attests to the **producing runtime build**. It does not
say **which agent** — human-authored or otherwise — was acting when the
entry was emitted. Two different agents inside the same workspace, signed by
the same workspace key, are today indistinguishable in the receipt.

Agent identity closes that gap without changing the trust model:

- **Attribution.** "Which agent decided this?" answered from the receipt
  alone, offline.
- **Compromise scoping.** A leaked agent key retires without invalidating
  historical entries produced under a prior key — rotation preserves the
  chain.
- **Trust Graph groundwork.** Downstream Trust Graph views (Wave 4 Track 3)
  key on `agentIdentity.fingerprint`; the graph is a lens over receipts, not
  a new source of truth.

## The `agentIdentity` field

Optional top-level field on every `AvarEntry`:

```jsonc
{
  // ... standard avar/1.x fields ...
  "agentIdentity": {
    "agentId": "planner-a",         // stable local identifier
    "alg": "Ed25519",               // required if the block is present
    "fingerprint": "3f9a…",         // 12 hex chars, SHA-256 prefix of pubkey JWK (advisory)
    "publicKey": "MCowBQYDK2VwAyEA…",// B1: base64url raw Ed25519 pubkey (32 bytes). Required whenever `agentSignature` is present.
    "publicKeyRef": "did:key:z6Mk…" // OPTIONAL; verifier hint, not enforced
  },
  "agentSignature": "…"             // B1: base64url Ed25519 sig over the tail stepHash (or GENESIS_STEP if no steps).
}
```

### Semantics

- **Absent `agentIdentity`** — no per-agent claim. Valid, but unattributed
  at the sub-workspace level.
- **Present `agentIdentity` (no `agentSignature`)** — the entry *claims* to
  be produced by a specific agent. Advisory-only; equivalent to pre-B1
  behavior.
- **Present `agentSignature`** — the entry *proves* the tail `stepHash` was
  observed by an actor holding the private key matching
  `agentIdentity.publicKey`. Verifiers MUST enforce this signature (B1
  below).
- **Never a gating field for chain verification.** A receipt without
  `agentIdentity` still passes chain verification. Agent signatures are a
  *separate* verification axis.
- **Rotation preserves history.** When an agent rotates its key, the new
  key signs a rotation attestation that references the retired fingerprint.
  Historical entries carrying the old fingerprint + `publicKey` remain
  verifiable indefinitely because the pubkey travels inside the receipt.

## Verifier behavior

### B1 — Agent-signature enforcement (added 2026-07-15, spec 1.5.1)

For each entry with `agentSignature` present:

1. If `agentIdentity.publicKey` is missing → issue
   `agent-key-unresolved`; report field `agentSignaturesUnresolved++`;
   verdict downgrades to `valid-with-warnings` (not `invalid`).
2. Compute `tail = last(steps).stepHash ?? GENESIS_STEP_HASH`.
3. Verify `agentSignature` (Ed25519) over `utf8(tail)` using the raw 32-byte
   pubkey decoded from `agentIdentity.publicKey`.
4. On failure → issue `agent-signature-invalid`;
   `agentSignaturesOk = false`; verdict = `invalid`;
   `classifyReport` returns `AGENT_SIGNATURE_INVALID`.

Entries without `agentSignature` are unaffected — pure backwards compat
with pre-B1 producers.

Report shape adds: `agentSignaturesOk`, `agentSignaturesChecked`,
`agentSignaturesUnresolved`.

CLI flags:

- `avar verify --agent` prints the `agentIdentity` block if present.
- `avar verify --require-agent=<fingerprint>` exits non-zero if any entry's
  fingerprint doesn't match.
- Default `avar verify` now surfaces `agent-sigs: N verified` in the human
  output when any `agentSignature` is present.

### B2 — Rotation & revocation (added 2026-07-15, spec 1.5.2)

Producer-side lifecycle actions. B2 is invisible to the verifier — every
receipt already carries its own `agentIdentity.publicKey` (B1), so history
stays verifiable regardless of what the producer does with the private key.

**Rotate.** Mint a fresh keypair for the same `agentId`, mark the previous
key retired with a `supersededBy` pointer, and emit a *rotation attestation*
signed by the NEW key over:

```jsonc
{ "kind": "agent-key-rotation", "agentId": "…", "from": "<oldFp>|null", "to": "<newFp>", "at": <ms> }
```

Rotation attestations are stored locally (browser: IndexedDB
`rotation-log`; CLI: `~/.aarmos/identity/rotation-log.jsonl`) and MAY be
distributed alongside receipts. A verifier that pins an agent's earliest
fingerprint can walk the attestation chain to prove the current active
fingerprint is a legitimate successor. Attestations are advisory — they
never gate chain verification of an individual receipt.

**Revoke.** Retire the current key and write a tombstone record. Producers
MUST refuse to mint or sign under a tombstoned `agentId` until the
tombstone is explicitly cleared. Historical receipts remain fully
verifiable (B1 guarantees offline pubkey resolution). Revocation is a
producer-side policy signal, not a verifier-side gate.

Reference implementations:

- Browser: `src/lib/identity/agent-keys.ts` — `rotateAgentKey`,
  `revokeAgentKey`, `unrevokeAgentKey`, `listRotationLog`,
  `listRevocations`. UI at `/identity`.
- CLI: `aarmos identity rotate <agentId>`, `aarmos identity revoke <agentId> [--reason=<text>]`.

### B3 — Portability (added 2026-07-15, spec 1.5.3)

Producer-side portability. Agents move between devices via a
passphrase-encrypted bundle. The verifier is unchanged.

**Bundle wire format** (`identity-bundle-v1`, JSON):

```jsonc
{
  "kind":   "aarmos-identity-bundle",
  "v":      1,
  "kdf":    { "name": "scrypt", "N": 131072, "r": 8, "p": 1, "keyLen": 32 },
  "cipher": "xchacha20-poly1305",
  "salt":   "<b64url 16 bytes>",
  "nonce":  "<b64url 24 bytes>",
  "ct":     "<b64url ciphertext||tag>"
}
```

Plaintext payload (canonical JSON) carries `agentId`, `alg`, `fingerprint`,
`createdAt`, 32-byte raw `publicKeyRaw` + `privateKeySeed`, the full
`rotationLog`, and any active `revoked` tombstone. Seeds are
**canonical**: CLI reconstructs a PKCS8 PEM from the seed; browser imports
the seed as a WebCrypto JWK with `ext: false` so subsequent `signWithAgent`
calls work without the seed staying reachable.

**Producer requirements:**

- Passphrase MUST be ≥ 8 characters. Callers SHOULD prompt for high-entropy
  passphrases; the scrypt cost (`N=2^17`) is deliberately slow (~250ms) to
  blunt offline attack.
- Wire file MUST be written with restrictive permissions (0600 on POSIX)
  and moved only over trusted channels.
- Import MUST refuse to replace an existing active key without an explicit
  overwrite flag. When overwriting, the outgoing key MUST be archived, not
  deleted, so the on-device rotation log stays intact.

**Verifier requirements:** none. Portability is invisible to `avar verify`:
every AVAR receipt already carries `agentIdentity.publicKey` per B1, so the
chain of custody is offline-verifiable regardless of which device signed
which entry.

Reference implementations:

- Format & crypto: `packages/cli/src/lib/identity-bundle.ts`
  (xchacha20-poly1305 + scrypt via `@noble/{ciphers,hashes}`).
- CLI: `aarmos identity export <agentId> --out <file>`,
  `aarmos identity import <file> [--as <agentId>] [--force]`.
  Both prompt for passphrase on TTY; honor `$AARMOS_IDENTITY_PASSPHRASE`
  and `--passphrase-file` for automation.
- Browser: `src/lib/identity/bundle.ts` (`importAgentBundleFromFile`) and
  the "Import bundle" control on `/identity`. Browser **export is
  deferred** to a follow-up ADR — WebCrypto keys are minted
  `extractable: false`, so v1 offers import only.






## Canonicalization

`agentIdentity` participates in canonical JSON per §2 exactly like any
other object field. No special-casing.

## Non-goals

- No PII inside `agentIdentity` — identifier + fingerprint + algorithm.
- No enforcement in the policy gate — identity is a claim, not a runtime
  decision. Policies MAY read the field via ABAC (§2.9), but doing so is
  independent of chain verification.
- No cross-workspace agent registry — that's a Trust Graph concern,
  layered on top of this field.
- Not a replacement for `origin` (avar/1.4). `origin` says *which build*;
  `agentIdentity` says *which actor*. They compose.
