# SPEC-ADDENDUM-1.16 — Compatibility contract, continuity witnesses, principal continuity

- Status: Accepted
- Date: 2026-08-03
- Wave: 18 (Preserving Truth Under Growth), stage S0
- Spec id: `avar/compat/1.0`, `avar/continuity-witness/1.0`
- Related: ADR-0004 (reproducible verification), ADR-0011 (governed object
  continuity), ADR-0012 (trust root lifecycle), ADR-0014 (compatibility
  contract)

This addendum is additive. No existing field changes meaning, and no
existing artifact becomes invalid.

## 1. Compatibility contract

### 1.1 Version grammar

```
spec-version = family "/" major [ "." minor ]
family       = lowercase alphanumeric with hyphens
major, minor = decimal integers
```

A change of `major` MAY change semantics. A change of `minor` MUST be
additive only: no field is removed, no field changes meaning, and no
outcome vocabulary is narrowed.

### 1.2 Readability verdicts

A verifier returns exactly one of:

| Verdict | Condition |
| --- | --- |
| `readable` | writer major supported; every field consumed |
| `readable-with-unresolved` | writer major supported; one or more fields not consumed, each named |
| `refused` | writer major not supported by this verifier, or version unparseable |

Rules:

1. **A verdict is stated under the semantics in force when the receipt was
   written.** The report names them.
2. **Unknown fields are never ignored and never fatal.** They are reported
   individually as `unresolved`, classified `extension` for `x-` prefixed
   keys (opaque by construction, SPEC section 2) and `unknown` otherwise.
3. **A verifier older than the receipt's major refuses.** Refusal is the
   correct output; a verdict the verifier cannot justify is worse than no
   verdict.
4. **Unresolved fields are named, never counted away.** No percentage, no
   score, no "mostly readable".
5. Growth in the spec changes what a verifier can *claim*, never what it
   *concludes* about the fields it does understand.

### 1.3 Readability horizon

A receipt written under a supported major remains readable by conformant
verifiers for at least **ten years** from the date it was written. The
horizon is published so it can be relied on in procurement, and is
mechanically tested against archived fixtures.

Withdrawing a major, or shortening the horizon, is a contract change and
follows §1.5.

### 1.4 Report shape

```json
{
  "spec": "avar/compat/1.0",
  "verdict": "readable-with-unresolved",
  "writer": "avar/1.7",
  "semanticsInForce": "avar/1.7",
  "unresolved": [{ "path": "entry.newField", "class": "unknown" }],
  "refusalReason": null,
  "detail": "Readable under avar/1.7; 1 field unresolved: entry.newField."
}
```

### 1.5 Contract change discipline

Published readability behavior is normative. A row in §1.2, the horizon in
§1.3, or the report shape in §1.4 may be changed only under a major version
bump, with the prior behavior remaining implemented for the horizon period.

## 2. Conformance

An implementation conforms when, for the same artifacts, it produces the
same verdicts and the same ordered `unresolved` list as
`packages/avar-core/src/compatibility.ts` and its WASM mirror. Parity is
enforced in CI with network access denied.

## 3. Continuity witnesses (`avar/continuity-witness/1.0`)

A continuity relation is only as durable as the party that can corroborate
it, and the predecessor is frequently the thing being removed. Corroboration
is therefore **captured at the event**, as a standalone artifact that
survives the predecessor's disappearance.

```json
{
  "spec": "avar/continuity-witness/1.0",
  "kind": "issuer-attestation",
  "capturedAt": 1754200000000,
  "predecessorRef": "aarmos://principal/…",
  "successorRef": "aarmos://principal/…",
  "corroborator": "idp.example.com",
  "digest": "sha256:…"
}
```

`kind` MUST be one of `external-anchor`, `countersignature`,
`recovery-point`, `chain-entry`, `issuer-attestation`. The corroborator MUST
NOT be the asserter. A witness `capturedAt` after the event it corroborates
MUST be rejected with a named reason.

### 3.1 Commitment

```
witnessCommitment = "sha256:" || hex(SHA-256(canonical(body)))
body = { spec, kind, capturedAt, predecessorRef, successorRef, corroborator, digest }
```

### 3.2 Corroboration state

Reported as a state, never a score:

| State | Meaning |
| --- | --- |
| `corroborated-at-event` | a witness was captured at or before the event; durable |
| `corroborable` | no witness, predecessor still reachable; one can still be captured |
| `decayed` | no witness, predecessor unreachable; permanently uncorroborable |
| `absent` | nothing claimed, nothing known |

`decayed` is reported for as long as the relation exists. It is never
resolved retroactively and never upgraded by an assertion.

## 4. Principal continuity: `identity-source-migration`

The governed continuity events of ADR-0011 are defined over objects. This
addendum adds one event over **principals**, for identity provider change.

The event is **per principal, never bulk**. It produces `successor of` only
when all of the following are present:

1. proof of control of the predecessor subject, issued under the
   predecessor issuer;
2. proof of control of the successor subject;
3. a countersignature from an authority valid at event time;
4. a continuity witness captured at the event (§3).

Absent any of these, the outcome is `continuity unresolved`, with the
missing elements named. An administrator's bulk mapping file is an
assertion, reported as `succession: asserted-uncorroborated`, and never an
event.

### 4.1 Grant survival

Enforcement continues under the **predecessor** binding for the remaining
term of each existing grant. No grant is re-bound to the successor
principal; re-issuance is an ordinary grant against the successor.
Throughout, reporting carries `principal continuity: unresolved` where it is
unresolved.

Claims drop; enforcement does not.
