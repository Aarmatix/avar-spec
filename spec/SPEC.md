# AVAR — Aarmos Verifiable Action Record

**Normative version:** `avar/1` — **AVAR 1.0 (Normative)**
**Status:** Normative. This document supersedes all pre-normative revisions (`1.0-rc1` through `1.20`), which are retained, unchanged, under `history/` for the record.
**License:** CC-BY-4.0 (see `LICENSE`). Reference implementation licensed separately (Apache-2.0).
**Stewardship:** Aarmatix LLC stewards AVAR `1.x`. A public RFC process opens with `avar/2`.

---

## 0. Status of this document

AVAR was developed as a base specification plus nineteen incremental addenda
while it had no external adopters. This document collapses that evolution into
a single normative baseline. Nothing is deleted: the pre-normative addenda live
in `history/` and remain readable, but they are **informative only** and no
longer define conformance.

There is exactly one normative definition of AVAR semantics. Every
implementation, fixture, and producer derives from it.

### 0.1 Normative vs. informative

**Normative** — this document, the companion object specifications in `spec/`,
the fixture set in `fixtures/`, error codes, canonicalization, hashing,
signature rules, and the verdict vocabulary.

**Informative** — ADRs, examples, tutorials, implementation notes, rationale,
everything under `history/`, and all prose marked *informative*.

Specification and fixtures together define conformance. A disagreement between
them is a **specification defect**: publication is blocked until they agree.
Fixtures never outrank this document.

### 0.2 The three layers

| Layer | Object | Role |
|---|---|---|
| 1 | **Entry** | The atom. One signed, hash-chained record of a single governed run. |
| 2 | **Bundle** | Packaging. A portable container of entries plus the material needed to verify them. |
| 3 | **Verification Result** | The specified output of a verifier. |

An Entry is meaningful without a Bundle. A Bundle adds no evidence semantics of
its own — it is transport with an integrity binding.

### 0.3 Naming

All field names in AVAR are **camelCase**. This is normative and applies to
entries, manifests, verification results, and every companion object.

---

## 1. Terminology

- **Entry** (`AvarEntry`) — one signed, hash-chained record of a single agent run.
- **Chain** — the ordered sequence of entries produced by one device, linked by prev-hash.
- **Bundle** (`AvarBundle`) — a ZIP archive containing entries, a manifest, and public keys.
- **Verifier** — any implementation that consumes a Bundle or an Entry sequence and produces a Verification Result per §6.
- **Producer** — any implementation that emits Entries. The reference runtime is one conforming producer; it is not authoritative over this specification.

The key words MUST, MUST NOT, SHOULD, MAY are to be interpreted per RFC 2119.

---

## 2. Canonical JSON

All hashing and signing operate over **canonical JSON** bytes. Non-canonical
serializations MUST be re-serialized before hashing.

1. **Encoding:** UTF-8, no BOM.
2. **Unicode:** all string values and object keys NFC-normalized before serialization.
3. **Key order:** sorted by UTF-16 code unit (equivalent to JavaScript `Array.prototype.sort` on the key list).
4. **String keys only.**
5. **`undefined` and function values are forbidden.** Producers MUST omit the key rather than substitute `null`, unless the field's schema explicitly permits `null`.
6. **Numbers MUST be finite.** `NaN`, `+Infinity`, `-Infinity` are forbidden. Serialization uses the shortest round-trip form.
7. **No whitespace** between tokens.
8. **No trailing newline.**
9. **Escaping** per RFC 8259 only. Non-ASCII characters MUST NOT be escaped.

```
canonicalize(v):
  if v is null | boolean | number | string: return JSON per rules 5-9
  if v is array:  return "[" + join(",", map(canonicalize, v)) + "]"
  if v is object:
    keys  = sort(Object.keys(v))            // UTF-16 code-unit order, undefined dropped
    parts = [ JSON.stringify(k) + ":" + canonicalize(v[k]) for k in keys ]
    return "{" + join(",", parts) + "}"
```

### 2.1 Unknown fields

A verifier MUST preserve unknown fields byte-for-byte when re-serializing for
hash checks, and MUST NOT fail on their presence. From AVAR 1.0 onward,
unknown-field tolerance is a guarantee: a conformant 1.0 verifier reading a
receipt written under a later 1.x minor revision states a verdict about the
fields it understands and **names** the fields it does not (§6.4). Unknown
fields are never silently ignored and never fatal.

Producers MAY add extension fields prefixed `x-`. All fields — known and
`x-*` — participate in the signed body and the hash chain exactly as written.

---

## 3. Entry

### 3.1 Core shape

```ts
type AvarEntry = {
  // Identity
  id: string;                 // UUID v4
  ts: number;                 // start time, epoch ms
  finishedAt?: number;
  workspaceId: string;
  agentId?: string;           // absent = main chat

  // Display-only snapshot (never authority-bearing)
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
  seed?: number | string;
  systemFingerprint?: string;

  // Device & policy binding
  deviceFingerprint?: string; // MUST equal sha256(devicePubKey)[0..12]
  policyFingerprint?: string;
  policyIssuer?: string;

  // Delegation lineage
  parentTraceId?: string | null;
  delegationChain?: { agentId: string; traceId?: string | null; at: number }[];

  // Chain (§4)
  prevHash?: string;          // 64 hex
  entryHash?: string;         // 64 hex

  // Signature envelope (§3.4) — NOT part of the signed body
  signature?: string;         // base64url
  devicePubKey?: string;      // base64url, raw Ed25519
} & OptionalEvidenceFields & { [k: `x-${string}`]: unknown };
```

### 3.2 Steps

```ts
type TraceStep = ToolStep | TextStep | DecisionStep;

type ToolStep = {
  kind: "tool"; ts: number; tool: string;
  argsRedacted: unknown; outputPreview?: string;
  ok: boolean; ms?: number; error?: string;
  policyHits?: { ruleId: string; action: "block"|"downgrade"|"warn"|"allow"; reason?: string }[];
  contract?: { in?: "pass"|"fail"|"absent"; out?: "pass"|"fail"|"absent";
               violations?: string[]; fingerprint?: string };
  target?: DeclaredTarget;             // §3.3.8
  prevStepHash?: string; stepHash?: string;
};

type TextStep = { kind: "text"; ts: number; preview: string;
                  prevStepHash?: string; stepHash?: string };

type DecisionStep = {
  kind: "decision"; ts: number; tool: string;
  decision: string;                    // open vocabulary — see below
  source: string;
  reason?: string; note?: string;
  gates?: { kind: string; source: string }[];
  policyFingerprint?: string; policyIssuer?: string;
  bundleState?: "unknown"|"none"|"valid"|"grace"|"invalid";
  killSwitchAt?: boolean;
  killScope?: "all"|"writes"|"destructive";
  argsBeforeHash?: string; argsAfterHash?: string; modifyReasons?: string[];
  deferralId?: string; deferReason?: string; resolutionMethods?: string[];
  timeoutMs?: number; resolvedAt?: number; resolutionMethod?: string;
  remediation?: Remediation[];         // §3.3.7
  resource?: { classification?: "public"|"internal"|"confidential"|"restricted";
               unlabelled?: boolean };  // §3.3.6
  frameworks?: string[];
  prevStepHash?: string; stepHash?: string;
};
```

`decision` is an open string. The reserved values are `ALLOW`, `MODIFY`,
`DENY`, `STEP_UP`, `DEFER`, `KILL`, `KILL_REVERT`, `ROTATE`, `REVOKE`,
`FIRST_CONTACT`. Verifiers MUST treat unrecognized values as opaque data.

### 3.3 Optional evidence fields

Every field in this section is OPTIONAL and additive. Absence is meaningful:
it means *nothing was declared*, never *the value was empty or unknown*. A
receipt from a producer that declares none of them is byte-identical to a
receipt from a producer that does not implement them.

**3.3.1 Cross-party binding** — `parentReceipt?: { hash, issuer?, traceId?, protocol? }`.
Pins the caller's receipt when the run was initiated across a trust boundary.

**3.3.2 Producer origin** — `origin?: { release, releaseSig?, builderPubkey? }`.
Attributes the emitting build. Never gates a verdict.

**3.3.3 Agent identity** — `agentIdentity?: { agentId, alg: "Ed25519", fingerprint, publicKey? }`
and `agentSignature?: string`. When both `agentSignature` and
`agentIdentity.publicKey` are present, verifiers MUST verify the signature over
the tail `stepHash` (or `GENESIS_PREV_STEP_HASH`) and fail hard on mismatch.
`agentSignature` without a resolvable key yields the warning
`agent-key-unresolved`. `fingerprint` is advisory and is not recomputed.

**3.3.4 Governance provenance** — `governance?: { authorityId, manifestSequence, policyDigest, policyLabel?, evidenceRef? }`.
Lets a holder of the matching authority manifest confirm *governed by X at
sequence N* offline. Verifiers MUST NOT fetch anything to evaluate it.

**3.3.5 Lineage** — `lineage?: { policyBundle?, runtimeBuild?, parentReceipt?, agentKey? }`.
A compact grouping key. Never gates chain or signature verdicts.

**3.3.6 Classification** — `resource.classification` on a decision step carries
the level in force at decision time, drawn from the closed ordered lattice
`public < internal < confidential < restricted` (`classificationVersion = "classification/1"`).
`resource.unlabelled: true` records that the level came from fail-closed
evaluation rather than a declaration. The lattice is closed: deployments MUST
NOT add, remove, or reorder levels. A verifier that implements classification
MUST compare decision frames before comparing verdicts — *evaluated under a
different classification version* is a materially different statement from
*different verdict*.

**3.3.7 Remediable denials** — a `DENY` decision step MAY carry
`remediation: { capability, constraint, expect: "MODIFY"|"STEP_UP", note? }[]`.
Rules: authored from the signed policy artifact, never synthesized from the
request, heuristics, or a model; a statement rather than a grant, so taking the
path re-enters the gate as a fresh request; narrowing only, so a remediation
MUST NOT name a capability outside the reach of the denied request and MUST
carry a non-empty constraint. Presence of a remediation MUST NOT change the
verdict of the denial.

**3.3.8 Declared intent and target** —
`declaredIntent?: { text, declaredBy: "user"|"caller"|"adapter", at }` at entry
level, and `target?: { resource, kind?, declaredBy: "adapter"|"caller" }` at
tool-step level. Both are **declared, never inferred**: a producer MUST NOT
parse them out of arguments, summarize them with a model, or guess them from a
tool name. `declaredBy` MUST NOT be `"runtime"` — the runtime does not have
intent. Neither field carries authority; intent is a claim about motive, and
motive is not observable and MUST NOT gate a decision. Length caps: intent text
512, target resource 256, target kind 64.
The legacy scalar pair `intent?: string` / `intentHash?: string` remains
readable; new producers SHOULD emit `declaredIntent`.

**3.3.9 Chain closure** — `closure?: { workspaceId, reason, closedAt, finalEntryHash, closedEntryCount, note? }`.
An entry carrying this block is a terminal *closure marker*: the chain for that
workspace is deliberately ended and no further entries will be appended. See
§4.4. Closure is neither deletion nor revocation.

**3.3.10 Multi-seat** — `seatId?: string`. Opaque; reserved for aggregation.

**3.3.11 Framework tags** — `frameworks?: string[]` at entry or step level.
Reserved vocabulary: `eu-ai-act:art-12`, `eu-ai-act:art-14`,
`hipaa:164.312-b`, `soc2:cc7.2`, `nist-ai-rmf:measure-2.7`,
`nist-ai-rmf:manage-2.3`, `iso-42001:8.4`. Custom tags MUST use an `x-` prefix.
Adding a reserved value requires a spec revision.

**3.3.12 Decision envelope** — `decision?: { ... }`. OPTIONAL and additive.
Present only when the entry governed a **declared Decision**; when absent the
entry is *authority-only* and no schema, input contract, or execution window
applies. Both shapes are conformant, and verifiers predating this section MUST
treat `decision` as opaque data per §2.1 and still report `valid`.

The envelope records the schema pin (semantic `version` **and** content
`hash`), each declared input's type, stable identifier, runtime-assigned
provenance, classification, observation reference, and satisfaction state, the
per-participant outcome, the composed `verdict`, and the bounded
`executionWindow`. Normative rules:

- Provenance is assigned by the runtime, never claimed by the caller.
- Observation carries a reference, never a payload (ADR-0001).
- `unable` is a participant outcome, never a Verdict. A verifier MUST be able
  to distinguish "evaluated and denied" from "unable to evaluate" from the
  receipt alone.
- A verdict authorizes execution only inside `executionWindow`.

The full grammar, including bindings and participant contracts, is normative in
[`spec/decision-governance.md`](./spec/decision-governance.md). Fixtures
`14-decision-allow` and `15-decision-unable` pin the wire form.

**3.3.13 Decision observations and drift** — `decision.observation?`,
`decision.participants[].observation?`, and `decision.drift?`. All OPTIONAL and
additive.

An *observation* is a fact the runtime witnessed while the decision was
evaluated; it is never a metric, a score, a grade or a health indicator. The key
sets are CLOSED — a verifier MUST reject unknown keys inside an observation
rather than treat them as extension data.

```
participants[].observation = {
  disposition:    "invoked" | "skipped" | "timeout" | "failed" | "unavailable"
  reason?:        string      // REQUIRED when disposition is not "invoked"
  inputsConsumed?: string[]   // declared input names, sorted
}

observation = {
  retries?:      number
  overrides?:    number
  replayResult?: "reproduced" | "diverged" | "not-replayed"
}
```

`drift` records the governance configuration the instance ran under, so that
"what changed?" is answered from evidence instead of inferred:

```
drift = {
  schemaHash:          string
  policyHash?:         string
  authorityVersion?:   string
  participantSetHash:  string   // order-sensitive hash of the composition
  frame?: { latticeVersion, resourceModelVersion, frameId }
}
```

Normative rules:

- Observations MUST NOT participate in composition and MUST NOT participate in
  replay. Two receipts that differ only in observations produce the same verdict.
- `participantSetHash` is order-sensitive: inserting a participant, removing
  one, or reordering the composition is a different governance configuration
  even when schema, policy and authority are unchanged.
- Derived statements computed from observations MUST cite the fields they were
  derived from; a statement that cannot cite its evidence MUST NOT be emitted.
- A decision identifier is a permanent governance identity. It MUST NOT change
  across schema versions; a different decision is a different `decision.id`.

Fixtures `14-decision-allow` and `15-decision-unable` pin the observation and
drift wire form.

### 3.4 Signed body and signature envelope

The signed body is the Entry with `signature` and `devicePubKey` removed. All
other fields — including `deviceFingerprint`, `prevHash`, `entryHash`, and any
`x-*` extension — are included.

```
deviceFingerprint = hex(sha256(utf8(devicePubKey_b64u)))[0..12]
```

Producers MUST stamp `deviceFingerprint` before signing. Verifiers MUST
recompute it and reject on mismatch.

- Algorithm: **Ed25519** (RFC 8032); raw 32-byte public key as base64url, unpadded.
- Signature: raw 64-byte signature over `utf8(canonicalize(signedBody))`, base64url, unpadded.

An entry lacking `signature`/`devicePubKey` is **unsigned**. Unsigned entries
are permitted (§4.3) but a verifier MUST report them and MUST NOT return the
verdict `valid`.

---

## 4. Hash chain

### 4.1 Entry chain

```
GENESIS_PREV_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

prevHash(E_i)  = entryHash(E_{i-1})   // GENESIS_PREV_HASH for i = 0
chainBody(E_i) = canonicalize(E_i minus { entryHash, signature, devicePubKey })
entryHash(E_i) = hex(sha256(utf8(prevHash(E_i) + "\n" + chainBody(E_i))))
```

The separator is a single ASCII line feed (`0x0A`).

### 4.2 Step chain

```
GENESIS_PREV_STEP_HASH = "step-genesis:0000000000000000000000000000000000000000000000000000000000000000"

prevStepHash(S_j) = stepHash(S_{j-1})  // GENESIS_PREV_STEP_HASH for j = 0
stepBody(S_j)     = canonicalize(S_j minus { stepHash })
stepHash(S_j)     = hex(sha256(utf8(prevStepHash(S_j) + "\n" + stepBody(S_j))))
```

Steps MAY be unchained. A **partially** chained `steps[]` array is invalid:
either every step carries chain fields or none does.

### 4.3 Unchained-entry reset

An entry lacking both `prevHash` and `entryHash` is unchained. The verifier
reports it as a warning, and the expected `prevHash` for the next entry resets
to `GENESIS_PREV_HASH`.

### 4.4 Closure rules

A closure marker (§3.3.9) MUST be the terminal entry for its workspace, MUST be
signed, MUST carry `closure.workspaceId` equal to its own `workspaceId` and
`closure.finalEntryHash` equal to its own `prevHash`, and MUST be singular per
workspace. Any entry appended after a closure marker for the same workspace is
a `closure-violated` failure. Closure is non-destructive: prior entries remain
verifiable forever.

---

## 5. Bundle

A ZIP archive (no encryption) with these mandatory members:

| Path | Description |
|---|---|
| `SPEC-VERSION` | Exactly `avar/1` followed by one LF. |
| `manifest.json` | Canonical JSON per §2. Shape below. |
| `entries.ndjson` | One canonical-JSON Entry per line, chain order (oldest first), LF-terminated. |
| `pubkeys.json` | `{ "keys": [ { "kid", "algorithm": "Ed25519", "publicKey" } ] }`, `publicKey` base64url, `kid` equal to the 12-char device fingerprint. |

Files named `x-*` MAY be present and MUST be ignored by verifiers that do not
recognize them.

```jsonc
{
  "format": "avar/1",
  "generatedAt": "2026-08-04T12:34:56.000Z",   // ISO 8601 UTC
  "producer": { "name": "aarmos", "version": "0.x.y" },
  "entryCount": 42,
  "entriesSha256": "<hex sha256 of the raw bytes of entries.ndjson>",
  "chainHead": { "entryHash": "<hex, empty if entryCount == 0>", "index": 41 },
  "devicePublicKeys": ["<base64url>"]
}
```

`entriesSha256` binds the manifest to the exact byte sequence of
`entries.ndjson`. Verifiers MUST recompute it and reject on mismatch.

---

## 6. Verification Result

### 6.1 Shape

```ts
type VerificationReport = {
  formatOk: boolean;
  entriesSha256Ok: boolean;
  chainOk: boolean;
  perStepChainOk: boolean;
  signaturesOk: boolean;
  fingerprintsOk: boolean;
  agentSignaturesOk: boolean;
  agentSignaturesChecked: number;
  agentSignaturesUnresolved: number;
  entryCount: number;
  signedCount: number;
  unsignedCount: number;
  unchainedCount: number;
  chainHead: { entryHash: string; index: number };
  issues: { index: number; kind: IssueKind; detail?: string }[];
  closure?: { workspaceId: string; reason: string; closedAt: number;
              closedEntryCount: number; index: number };
  compatibility: CompatibilityReport;          // §6.4
  verdict: "valid" | "valid-with-warnings" | "closed" | "invalid";
};
```

### 6.2 Algorithm

Verifiers MUST perform these steps in order and MUST NOT perform network I/O.

1. **Compatibility.** Parse the declared spec version and decide whether a
   verdict may be stated at all (§6.4). `refused` terminates verification.
2. **Format.** `SPEC-VERSION` and `manifest.format` both equal `avar/1`.
3. **Envelope integrity.** sha256 of raw `entries.ndjson` equals `manifest.entriesSha256`.
4. **Parse.** Each line of `entries.ndjson` parses as JSON.
5. **Fingerprints.** Recompute `deviceFingerprint` for each signed entry.
6. **Signatures.** Verify Ed25519 over `canonicalize(signedBody)`. Unsigned entries increment `unsignedCount`.
7. **Agent signatures.** Per §3.3.3.
8. **Entry chain.** Per §4.1 and §4.3.
9. **Step chain.** Per §4.2.
10. **Closure.** Per §4.4.
11. **Chain head.** From the last entry, or `{ entryHash: "", index: -1 }` when empty.
12. **Verdict.** Per §6.3.

### 6.3 Verdicts

- `invalid` — any of `formatOk`, `entriesSha256Ok`, `chainOk`, `perStepChainOk`, `signaturesOk`, `fingerprintsOk`, `agentSignaturesOk` is false, or any closure issue is present.
- `closed` — all integrity checks pass and a conformant closure marker is present. **`closed` is a success verdict**; conformant CLIs exit `0`.
- `valid-with-warnings` — all integrity checks pass and `unsignedCount > 0`, `unchainedCount > 0`, or `agentSignaturesUnresolved > 0`.
- `valid` — all integrity checks pass with no warnings.

### 6.4 Compatibility contract

`compatSpecId = "avar/compat/1.0"`. One question, answered from bytes alone:
*can this verifier state a verdict about this receipt, and under whose
semantics?* Three outcomes, and only three:

| Outcome | Meaning |
|---|---|
| `readable` | Every field read is understood. |
| `readable-with-unresolved` | Read under the semantics in force when written; unresolved fields are **named**, never counted away and never fatal. |
| `refused` | The receipt's MAJOR version exceeds the verifier's. No verdict is claimed — a verdict it cannot justify would be worse than no verdict. |

A newer receipt changes what a verifier may *claim*, never what it *concludes*
about the fields it does understand. Conformant verifiers state a readability
horizon of at least **10 years** for any receipt under a supported major.

### 6.5 Issue kinds (normative closed set)

`spec-version-mismatch`, `manifest-invalid`, `entries-parse-failed`,
`entries-sha256-mismatch`, `fingerprint-mismatch`, `signature-invalid`,
`signature-unsupported`, `chain-broken`, `partial-step-chain`,
`step-chain-broken`, `agent-signature-invalid`, `agent-key-unresolved`,
`governance-authority-mismatch`, `governance-sequence-stale`,
`governance-policy-unlisted`, `governance-unverified`, `closure-invalid`,
`closure-duplicate`, `closure-violated`.

Adding an issue kind is a minor revision and moves specification, fixtures,
reference implementation, and producers together (§10).

---

## 7. Redaction contract

Producers MUST scrub, before hashing and signing, any field carrying raw PII,
plaintext secrets, or free-form model output: `queryRedacted`,
`ToolStep.argsRedacted` (nested objects walked), `ToolStep.outputPreview`
(≤512 chars, MAY be omitted), `TextStep.preview`.

Producers MUST NOT include raw secrets, OAuth tokens, or session cookies
anywhere in an entry. Producers MAY include provider ids, model ids, tool
names, host names, and cost/token counts.

Verifiers do not enforce redaction; they verify integrity. AVAR does not
guarantee that a producer scrubbed everything. It guarantees that whatever was
recorded cannot be altered without detection.

---

## 8. Companion object specifications (normative)

These objects have their own lifecycle and are specified separately. They are
normative and versioned with this baseline.

| Document | Object |
|---|---|
| `spec/trust-lists.md` | Signed trust lists |
| `spec/trust-manifests.md` | Trust manifests and subscriptions |
| `spec/authority-manifests.md` | Authority-shaped trust manifests |
| `spec/governed-change.md` | Governed change sets |
| `spec/recovery-points.md` | Governance recovery points |
| `spec/trust-boundaries.md` | Declared data contracts, authority-bound credentials |
| `spec/continuity.md` | Continuity witnesses, principal continuity |
| `spec/fork-and-succession.md` | Fork points, hold replication, authority succession |

---

## 9. Conformance and fixtures

A conformant verifier MUST reproduce the expected Verification Result for every
fixture in `fixtures/`, byte-comparable on the fields each fixture pins.

Fixtures are generated from a real producer run, never hand-written, and are
committed alongside their expected results. **No AVAR artifact is released to
any third party until the public reference verifier validates it without
private code** — this is the launch gate, and it is mechanized in CI.

Conformance requirements for implementations — what a package must satisfy
before calling itself an AVAR verifier, for every AVAR version it declares —
are normative and live in [`IMPLEMENTATION.md`](./IMPLEMENTATION.md).

The fixture corpus carries its own version, independent of this specification's
version and of any implementation version, and is published as
`@avar-standard/fixtures@<corpus-version>`. A published corpus is immutable;
corrections publish a new corpus version.

---

## 10. Versioning and change control

- `avar/1` is the wire family token. The normative revision is **1.0**.
- Additive changes (new step kinds, new decision values, new optional fields, new reserved framework tags) are **minor** revisions. Conformant 1.0 verifiers accept them per §2.1.
- Breaking changes (canonicalization, hash algorithm, envelope layout, field removal, casing) require `avar/2`.
- **Verdict-bearing changes** — anything affecting a verdict, canonicalization, hashing, signing, the verdict vocabulary, or the issue-kind set — move specification, fixtures, reference implementation, and producers **together, in one change**. Non-verdict metadata may lag.
- Dependency direction, after ratification of this baseline:

```text
specification  ->  fixtures  ->  reference implementation  ->  producers
```

- **No private-only receipt semantics.** If a producer emits it, this
  specification defines it and the public reference verifier either understands
  it or explicitly reports it unresolved (§6.4).

---

## 11. Governance

Aarmatix LLC stewards AVAR `1.x`. Editorial changes, clarifications, and
fixture additions are made by the steward with a `CHANGELOG.md` entry.
Substantive protocol changes require a public RFC starting with `avar/2`.

Spec text is CC-BY-4.0. The reference implementation is Apache-2.0 and lives in
the public reference-verifier repository; a vendor runtime is one conforming
producer and holds no special status under this specification.
