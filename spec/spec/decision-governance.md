# Decision Governance — optional `decision` envelope

Status: additive and OPTIONAL. Verifiers that predate this section MUST treat
`decision` as opaque data per §2 (unknown-field tolerance) and continue to
report `valid`. Receipts with and without `decision` are both conformant.

Doctrine: the runtime governs Decisions. Participants evaluate them. Tools execute
them. Evidence proves them. The Decision Schema is a **contract**, not a
primitive, and not a rules engine.

## 1. Envelope

```jsonc
"decision": {
  "id": "finance.pay_vendor",            // <namespace>.<action>, lower snake
  "label": "Pay vendor",                 // optional, human-facing only
  "schema": { "version": "1.0.0", "hash": "<sha256-hex>" },
  "inputs": [ /* §2 */ ],
  "verdict": "ALLOW" | "DENY" | "STEP_UP",
  "executionWindow": { "notBefore": 0, "notAfter": 0 },
  "participants": [ /* §3 */ ]
}
```

`decision` is covered by the entry hash. `schema.hash` is SHA-256 over the
canonical schema form (§4) using AVAR canonical JSON (§2 of the base spec).

## 2. Inputs

```jsonc
{
  "name": "vendor",
  "type": "acme.vendor_record",          // customer-declared, nominal, opaque
  "identifier": "v-42",                  // stable identifier of the resource
  "provenance": "declared|derived|participant|external",
  "classification": "public|internal|confidential|restricted",
  "observation": { "system": "erp", "ref": "erp://invoice/9",
                   "observedAt": 0, "ingestedAt": 0 },
  "satisfied": true,
  "unsatisfied": { "reason": "missing|invalid|provenance",
                   "dimensions": ["freshness","expiry","revocation","window"] }
}
```

- **Provenance is runtime-assigned.** A caller MUST NOT be able to claim a
  source class. Implementations MUST strip provenance-bearing keys from caller
  payloads; caller-supplied values are `declared`.
- **Observation carries a reference, never a payload** (ADR-0001).
- **Validity has four independent dimensions**; every failing dimension is
  reported. A validity failure is `unsatisfied(invalid)` — never a pass and
  never a substituted value.

## 3. Participants

```jsonc
{ "participantId": "risk", "outcome": "allow|deny|step_up|unable",
  "effective": "ALLOW|DENY|STEP_UP", "unableReason": "scan unavailable" }
```

`unable` is an internal participant outcome and MUST NOT appear as a Verdict.
It resolves through the participant's declared `onUnable` posture, which is
`deny` or `step_up`; `allow` is unrepresentable. Verifiers MUST be able to tell
"evaluated and denied" from "unable to evaluate" from the receipt alone.

## 4. Schema contract

The schema grammar is closed. Permitted keys:

- schema: `decisionId`, `version`, `inputs`
- input: `name`, `type`, `identifier`, `provenance`, `required`,
  `classification`, `validity`
- validity: `freshnessMs`, `expires`, `revocable`, `observationWindowMs`

Any other key is a parse error. There are no conditions, formulas, branches or
workflow steps. `version` is a semantic version and is included in the hash
preimage, so a version bump always changes the hash; a receipt pin that matches
on version but not on hash MUST fail verification.

## 5. Approvals

An approval satisfies a STEP_UP. It MUST NOT satisfy an unsatisfied required
input. Approvals are single-use and bound to a fingerprint that includes the
schema pin, the decision instance, and the identifier plus satisfaction state of
every declared input — so an approval cannot be replayed after any scope-bearing
input changes.

## 6. Execution window

A Verdict authorizes execution only inside `executionWindow`. Inputs declared
`revocable` or `expires` are re-checked at commit time; a lapse between
evaluation and execution invalidates the authorization.

## 7. Authority-only

Governance is fully functional with no declared Decision. When `decision` is
absent, the receipt is authority-only and no schema, input contract or window
applies.

## Bindings and participants (Phase 2)

A **Binding** maps one Decision, pinned to one schema version, to the
Participants that evaluate it, inside exactly one team.

```json
{
  "decisionId": "clinical.release_patient",
  "schemaVersion": "2.1.0",
  "teamId": "team-a",
  "executionTtlMs": 30000,
  "participants": [
    {
      "participantId": "clinical-review",
      "responsibleFor": ["chart"],
      "requires": ["chart"],
      "trusts": ["external"],
      "onUnable": "deny"
    }
  ]
}
```

The binding grammar is **closed**: unknown keys are a hard parse error. There
is no ordering, branching, condition, or fallback participant — a binding
cannot become a workflow definition.

Structural validation:

- `decisionId` and `schemaVersion` MUST match the schema being bound.
- Every `responsibleFor` name MUST be declared by the schema.
- `requires` MUST be a subset of `responsibleFor`.
- `trusts` MUST be a non-empty subset of the provenance classes.
- `onUnable` MUST be `deny` or `step_up`. `allow` is unrepresentable.
- Every **required** schema input MUST have at least one responsible participant.

### Dispatch rules

- A participant receives only inputs in `responsibleFor` whose runtime-assigned
  provenance is in `trusts`.
- If any input it `requires` is unsatisfied or untrusted, the participant is
  **not consulted**. The runtime records `unable` with the blocking reason.
- A missing, failing, or throwing participant is `unable`, never `allow`.
- `unable` is resolved by the declared posture, then composed with all other
  effective outcomes by narrowing (`DENY` > `STEP_UP` > `ALLOW`).

### Receipt additions

The `decision` envelope gains an additive field:

```json
{ "binding": { "hash": "<sha256 of the canonical binding>" } }
```

Verifiers MUST accept receipts with and without it.

### Commit gate

Execution is authorized only inside `executionWindow`, and inputs declared
`revocable` or `expires` are re-checked at commit. A failed recheck records
`unsatisfied(invalid)` with the failing dimensions — never a silent pass.

### Change lifecycle

Bindings are governance state under the kind `decision.binding`: they are
proposed, analyzed, simulated, approved, and applied through the standard
Change lifecycle, and are never visible across team boundaries.


## 8. Observations and drift (normative)

Observations record what the runtime witnessed; drift records the configuration
it witnessed it under. Neither is an input to a verdict.

### 8.1 Observation grammar (closed)

Participant observation keys: `disposition`, `reason`, `inputsConsumed`.
Decision observation keys: `retries`, `overrides`, `replayResult`.
Dispositions: `invoked`, `skipped`, `timeout`, `failed`, `unavailable`.

Any other key is a validation error. Percentages, scores, grades, ratings,
health indicators and recommendations MUST NOT appear anywhere in this block.

### 8.2 Inertness

A conformant implementation MUST produce identical verdicts for two otherwise
identical instances that differ only in their observations, and replay MUST
ignore observations entirely.

### 8.3 Declared drift

`participantSetHash` is the content address of the participant composition with
order significant. Implementations MUST NOT infer composition change from the
participant list at read time; the hash is written at evaluation time.

### 8.4 Cited derivation

Derived observations (for example, "the decision waited because a participant
timed out") are statements over raw observations. Each derived statement MUST
name the raw fields it was computed from and MUST be recomputable from the
receipt alone.

### 8.5 Decision identity is permanent (I-G)

`decision.id` is immutable across schema versions. Schema evolution MAY change
inputs, validity and classification subject to the evolution rules; it MUST NOT
change the decision identifier.
