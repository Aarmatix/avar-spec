# AVAR — Aarmos Verifiable Action Record

**Version:** `avar/1` (spec revision `1.1`)
**Status:** Release Candidate — subject to change until `1.0` GA. Minor revision `1.1` (Wave 1.2 additions) is backward-compatible with `1.0-rc1`.
**License:** CC-BY-4.0 (see `LICENSE`).
**Stewardship:** Aarmatix LLC stewards versions `1.x`. A formal RFC process opens with version `2`.

---

## 1. Terminology & Scope

- **AvarEntry** — one signed, hash-chained record of a single agent turn (query → decisions → tool calls → outcome).
- **AvarChain** — the ordered sequence of entries produced by a single device, linked by prev-hash.
- **AvarBundle** — a portable zip archive containing one or more entries plus a manifest and the public keys required to verify them.
- **Verifier** — any implementation that consumes an AvarBundle and produces a `VerificationReport` per §6.

### In scope for `avar/1`
- Canonical JSON serialization rules (§2).
- Signed body definition and Ed25519 signature envelope (§3).
- Entry-level and per-step hash chain (§4).
- Bundle envelope layout (§5).
- Verification algorithm (§6).
- Redaction contract (§7).
- Framework tag vocabulary (§8).

### Out of scope for `avar/1`
- Signed *policy* bundles (separate mechanism, not verified by AVAR).
- Multi-device chain merge (reserved: `seatId` field present but unused).
- Encrypted-at-rest bundles (bundles are integrity-protected, not confidential).
- Timestamp authority / RFC 3161 counter-signatures.
- Kill-switch, vault-rotation, egress-first-contact receipts as **new event types** — those are added as new `TraceStep` decision sources in minor revisions (`avar/1.1`, `avar/1.2`) without breaking `avar/1` verifiers.

---

## 2. Canonical JSON

All hashing and signing operate over **canonical JSON** bytes. Non-canonical serializations MUST be re-serialized before hashing.

### Rules

1. **Character encoding:** UTF-8, no BOM.
2. **Unicode normalization:** All string values and object keys MUST be Unicode NFC-normalized before serialization.
3. **Object keys:** Sorted lexicographically by UTF-16 code unit (equivalent to JavaScript `Array.prototype.sort()` on the key list).
4. **Only string keys** are permitted.
5. **`undefined` values and function values are forbidden.** Producers MUST omit the key entirely rather than emit `null` as a substitute (unless the field's schema explicitly permits `null`).
6. **Numbers MUST be finite.** `NaN`, `+Infinity`, `-Infinity` are forbidden. Integer values in the safe range are serialized without a decimal point; other numbers use the shortest JavaScript `Number.prototype.toString()` form.
7. **No whitespace** between tokens.
8. **No trailing newline.**
9. **String escaping:** Only the escapes required by RFC 8259 (`\"`, `\\`, `\/` OPTIONAL — prefer unescaped, `\b`, `\f`, `\n`, `\r`, `\t`, and `\u00XX` for control characters `U+0000`..`U+001F`). Non-ASCII characters MUST NOT be escaped.

### Reference pseudocode

```
canonicalize(v):
  if v is null | boolean | number | string:
    return JSON serialization per rules 5-9
  if v is array:
    return "[" + join(",", map(canonicalize, v)) + "]"
  if v is object:
    keys = sort(Object.keys(v))                // UTF-16 code-unit order
    parts = [ JSON.stringify(k) + ":" + canonicalize(v[k]) for k in keys ]
    return "{" + join(",", parts) + "}"
```

> **Note.** The reference implementation in `packages/avar-core` is the normative tie-breaker for any ambiguity in this section. Verifiers SHOULD run the `unicode-edge` golden fixture (§9) as an acceptance test.

---

## 3. AvarEntry — Signed Body

### 3.1 Type

An AvarEntry has the following shape (TypeScript-flavored for illustration):

```ts
type AvarEntry = {
  // Identity
  id: string;                    // UUID v4
  ts: number;                    // start time, epoch ms
  finishedAt?: number;
  workspaceId: string;
  agentId?: string;              // undefined = main chat

  // Display-only identity snapshot
  agentName?: string;
  agentEmoji?: string;
  agentColor?: string;

  // Content
  queryRedacted: string;
  steps: TraceStep[];
  outcome: "ok" | "error" | "aborted";

  // Model surface
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  seed?: number | string;        // attestation only
  systemFingerprint?: string;    // attestation only

  // Device & policy binding
  deviceFingerprint?: string;    // MUST equal sha256(devicePubKey_b64u).slice(0, 12)
  policyFingerprint?: string;
  policyIssuer?: string;

  // Delegation lineage (R7)
  parentTraceId?: string | null;
  delegationChain?: { agentId: string; traceId?: string | null; at: number }[];

  // Chain (§4)
  prevHash?: string;             // hex, 64 chars
  entryHash?: string;            // hex, 64 chars

  // Reserved for Wave 4 multi-seat aggregation; MUST be absent or a string.
  seatId?: string;

  // Signature envelope (§3.3) — NOT part of the signed body
  signature?: string;            // base64url
  devicePubKey?: string;         // base64url, Ed25519 raw public key
};

type TraceStep =
  | ToolStep
  | TextStep
  | DecisionStep;                // includes source: "kill" | "vault" | "egress" | "consent" | "gate" | ...
```

Producers MAY add extension fields prefixed with `x-`. Verifiers MUST preserve unknown fields when re-serializing for hash checks. **All fields — known and `x-*` — participate in the signed body and hash chain** exactly as they appear.

### 3.2 Signed body

The signed body is the AvarEntry with the following fields removed:

- `signature`
- `devicePubKey`

**All other fields (including `deviceFingerprint`, `prevHash`, `entryHash`, and any `x-*` extensions) are included.**

`deviceFingerprint` MUST be derived as:

```
deviceFingerprint = hex( sha256( utf8Bytes( devicePubKey_b64u ) ) )[0..12]
```

Producers MUST compute and stamp `deviceFingerprint` **before** signing. Verifiers MUST recompute and reject on mismatch.

### 3.3 Signature envelope

- Algorithm: **Ed25519** (RFC 8032), raw 32-byte public key exported as base64url (no padding).
- Signature: raw 64-byte Ed25519 signature over the UTF-8 bytes of `canonicalize(signedBody)`, encoded as base64url (no padding).
- `signature` and `devicePubKey` fields hold the base64url strings.

Absence of `signature` / `devicePubKey` means the entry is **unsigned**. Unsigned entries are permitted in the chain (see §4 legacy-reset rule) but a verifier MUST report them as `unsigned` and MUST NOT report them as `valid`.

---

## 4. Hash Chain

### 4.1 Entry-level chain

Entries in a single device's ledger form a linked chain in insertion order.

Constants:

```
GENESIS_PREV_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
```

For each entry `E_i` with predecessor `E_{i-1}`:

```
prevHash(E_i) = entryHash(E_{i-1})       (or GENESIS_PREV_HASH for i = 0)
chainBody(E_i) = canonicalize( E_i with { entryHash: undefined, signature: undefined, devicePubKey: undefined } )
entryHash(E_i) = hex( sha256( utf8Bytes( prevHash(E_i) + "\n" + chainBody(E_i) ) ) )
```

The literal separator between `prevHash` and `chainBody` is a single ASCII line feed (`0x0A`).

### 4.2 Legacy-unchained-reset rule

An entry that lacks both `prevHash` and `entryHash` is a **legacy unchained entry**. When encountered during verification:

1. The verifier reports the entry as `unchained` (a warning, not an error).
2. The chain **resets**: the next entry's expected `prevHash` becomes `GENESIS_PREV_HASH` again.

This rule preserves auditability of pre-`avar/1` histories without invalidating the chain going forward.

### 4.3 Per-step chain (R5)

Within a single entry, `steps[]` MAY carry a per-step hash chain that binds decisions (`ALLOW`/`MODIFY`/`DENY`/`STEP_UP`/`DEFER`/`KILL`/`ROTATE`/`REVOKE`/etc.) to the tool calls they modified.

Constants:

```
GENESIS_PREV_STEP_HASH = "step-genesis:0000000000000000000000000000000000000000000000000000000000000000"
```

For each step `S_j` with predecessor `S_{j-1}`:

```
prevStepHash(S_j) = stepHash(S_{j-1})     (or GENESIS_PREV_STEP_HASH for j = 0)
stepBody(S_j) = canonicalize( S_j with { stepHash: undefined } )
stepHash(S_j) = hex( sha256( utf8Bytes( prevStepHash(S_j) + "\n" + stepBody(S_j) ) ) )
```

Steps MAY omit `prevStepHash`/`stepHash` (unchained). A partially-chained `steps[]` array is invalid — either every step carries chain fields or none do. Verifiers MUST report a partial per-step chain as `invalid` for that entry.

---

## 5. AvarBundle — Envelope

An AvarBundle is a ZIP archive (RFC-compliant, no encryption) with the following mandatory members:

| Path | Content-Type | Description |
|---|---|---|
| `SPEC-VERSION` | text/plain | Exactly the string `avar/1` followed by a single LF. |
| `manifest.json` | application/json | Bundle metadata (§5.1). Canonical JSON per §2. |
| `entries.ndjson` | application/x-ndjson | One canonical-JSON AvarEntry per line, terminated by LF. Entries MUST appear in chain order (oldest first). Trailing LF required if `entries.ndjson` is non-empty. |
| `pubkeys.json` | application/json | `{ "keys": [ { "kid": string, "algorithm": "Ed25519", "publicKey": string } ] }` where `publicKey` is base64url. `kid` MUST equal the 12-char device fingerprint (§3.2). |

Additional files with names prefixed `x-` MAY be included and MUST be ignored by verifiers that do not recognize them.

### 5.1 `manifest.json` schema

```jsonc
{
  "format": "avar/1",
  "generatedAt": "2026-07-06T12:34:56.000Z",  // ISO 8601 UTC
  "producer": { "name": "aarmos", "version": "0.x.y" },
  "entryCount": 42,
  "entriesSha256": "<hex sha256 of the raw UTF-8 bytes of entries.ndjson>",
  "chainHead": {
    "entryHash": "<hex, empty string if entryCount == 0>",
    "index": 41                                 // -1 if entryCount == 0
  },
  "devicePublicKeys": ["<base64url>", ...]      // union across all entries
}
```

`entriesSha256` binds the manifest to the exact byte sequence of `entries.ndjson`. Verifiers MUST recompute and reject on mismatch.

---

## 6. Verification Algorithm

Input: an AvarBundle. Output: a `VerificationReport`.

```ts
type VerificationReport = {
  formatOk: boolean;
  entriesSha256Ok: boolean;
  chainOk: boolean;
  perStepChainOk: boolean;
  signaturesOk: boolean;
  fingerprintsOk: boolean;
  entryCount: number;
  signedCount: number;
  unsignedCount: number;
  unchainedCount: number;
  chainHead: { entryHash: string; index: number };
  issues: Array<{ index: number; kind: string; detail?: string }>;
  verdict: "valid" | "invalid" | "valid-with-warnings";
};
```

Steps (verifier MUST perform in this order):

1. **Format check.** `SPEC-VERSION` == `avar/1`; `manifest.json.format` == `avar/1`. Fail → `formatOk = false`, verdict `invalid`.
2. **Envelope integrity.** Compute sha256 of raw `entries.ndjson` bytes; compare to `manifest.entriesSha256`. Fail → `entriesSha256Ok = false`, verdict `invalid`.
3. **Per-entry parse.** Parse each line of `entries.ndjson` as JSON. Fail → `formatOk = false`.
4. **Fingerprint check.** For each signed entry, recompute `deviceFingerprint` from `devicePubKey`; compare. Fail → `fingerprintsOk = false`, issue `{kind: "fingerprint-mismatch"}`.
5. **Signature check.** For each signed entry, verify Ed25519 signature over `canonicalize(signedBody)`. Fail → `signaturesOk = false`, issue `{kind: "signature-invalid"}`. Unsigned entries increment `unsignedCount` (not an error, but downgrades verdict to `valid-with-warnings`).
6. **Chain check.** Walk entries in order. For each entry:
    - If entry is legacy-unchained (§4.2), record `unchainedCount++`, warning, and reset expected `prevHash` to `GENESIS_PREV_HASH`.
    - Else verify `entry.prevHash == expectedPrevHash` and `entry.entryHash == recompute(entry)`. Fail → `chainOk = false`, issue `{kind: "chain-broken"}`.
7. **Per-step chain check.** For each entry with any step carrying chain fields:
    - Require **all** steps to carry chain fields (else `invalid`, issue `{kind: "partial-step-chain"}`).
    - Verify per-step chain per §4.3. Fail → `perStepChainOk = false`.
8. **Chain head.** Report `chainHead` from the last entry (or `{entryHash: "", index: -1}` for empty bundles).
9. **Verdict computation:**
    - `invalid` if any of `formatOk`, `entriesSha256Ok`, `chainOk`, `perStepChainOk`, `signaturesOk`, `fingerprintsOk` is `false`.
    - Else `valid-with-warnings` if `unsignedCount > 0` or `unchainedCount > 0`.
    - Else `valid`.

Verifiers MUST NOT perform any network I/O.

---

## 7. Redaction Contract

AVAR entries are designed to be shareable with third-party auditors. The following guarantees apply to entries produced by conformant producers:

**Producers MUST scrub** (before hashing/signing) any field that would carry raw user PII, plaintext secrets, or free-form model output. Specifically:

- `queryRedacted` — user query with tokens matching email, phone, SSN, credit-card, API-key, or JWT patterns replaced by `[REDACTED]` markers.
- `TraceStep.argsRedacted` (tool step) — same rules; nested objects walked.
- `TraceStep.outputPreview` (tool step) — truncated (≤512 chars) and redacted; MAY be omitted entirely.
- `TraceStep.preview` (text step) — truncated and redacted.

**Producers MUST NOT include** raw secrets, OAuth tokens, or session cookies anywhere in an entry.

**Producers MAY** include model provider IDs, tool names, host names in `TraceStep.tool`, and cost/token counts.

**Verifiers do not enforce redaction** — they only verify integrity. A bundle that verifies successfully still requires human review before public disclosure.

**Non-goal.** AVAR does not guarantee that a producer scrubbed everything. It guarantees that whatever was recorded cannot be altered without detection.

---

## 8. Frameworks Tag Vocabulary

Any AvarEntry or TraceStep MAY include a `frameworks: string[]` field. Values in the closed vocabulary below are reserved:

| Tag | Meaning |
|---|---|
| `eu-ai-act:art-12` | EU AI Act Article 12 (record-keeping) |
| `eu-ai-act:art-14` | EU AI Act Article 14 (human oversight) |
| `hipaa:164.312-b` | HIPAA Security Rule §164.312(b) (audit controls) |
| `soc2:cc7.2` | SOC 2 Trust Services Criteria CC7.2 (system monitoring) |
| `nist-ai-rmf:measure-2.7` | NIST AI RMF MEASURE 2.7 |
| `nist-ai-rmf:manage-2.3` | NIST AI RMF MANAGE 2.3 (human oversight controls) |
| `iso-42001:8.4` | ISO/IEC 42001 §8.4 |

Custom tags MUST use the `x-` prefix (e.g. `x-org:internal-policy-42`). Adding a value to the closed vocabulary requires a spec revision.

### `avar/1.1` additions

Minor revision `avar/1.1` (Wave 1.2 — Human Oversight Control) added:

- `DecisionStep.decision` is a `string` open-ended value. Verifiers MUST treat unknown values as opaque data. The reserved additive values introduced by `1.1` are `KILL` (kill-switch engaged) and `KILL_REVERT` (kill-switch disengaged). Classic policy verdicts (`ALLOW | MODIFY | DENY | STEP_UP | DEFER`) are unchanged.
- `DecisionStep.killScope?: "all" | "writes" | "destructive"` — scope stamped on `KILL` / `KILL_REVERT` entries.
- `DecisionStep.frameworks?: string[]` — per-step framework tags (in addition to the entry-level `frameworks[]`).
- Framework vocabulary additions: `eu-ai-act:art-14`, `nist-ai-rmf:manage-2.3`.

---

## 9. Golden Fixtures (Normative)

Conformant verifiers MUST pass all fixtures in `packages/avar-core/test/fixtures/`:

1. `empty` — zero entries.
2. `single` — one signed entry, no steps.
3. `multi-chain` — three signed entries, chained.
4. `per-step-chain` — one entry with a chained `decision` + `tool` step sequence.
5. `legacy-reset` — one unchained legacy entry followed by a fresh chain.
6. `tampered-signature` — signature byte-flipped on entry 2. Verdict: `invalid`.
7. `tampered-chain` — `prevHash` altered on entry 2. Verdict: `invalid`.
8. `unicode-edge` — NFC/NFD, surrogate pairs, emoji in `queryRedacted`. Verdict: `valid`.

---

## 10. Versioning

- `avar/1` is stable. Additive changes (new `TraceStep` kinds, new decision sources, new optional fields, new reserved framework tags) constitute a **minor** revision (`avar/1.1`, `avar/1.2`, …). Verifiers built for `avar/1.0` MUST accept minor-revision bundles without error, treating unknown additive fields per §3.1.
- **Breaking changes** (canonical JSON rule changes, hash algorithm change, envelope layout change, field removal) require `avar/2`.
- The spec revision (`1.0-rc1`, `1.0`, `1.1`, ...) is tracked in `CHANGELOG.md`.

---

## 11. Governance

Aarmatix LLC stewards AVAR `1.x`. Editorial changes, clarifications, and fixture additions are made by the steward at their discretion, with a `CHANGELOG.md` entry. Substantive protocol changes require a public RFC starting with `avar/2`.

The spec text is licensed under CC-BY-4.0 (see `LICENSE`). The reference implementation in `packages/avar-core/` is licensed separately under the repository's LICENSE.
