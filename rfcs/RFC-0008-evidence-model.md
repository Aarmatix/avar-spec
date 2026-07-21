# RFC-0008: Evidence Model

**Status:** Amended
**Target:** AVAR 1.10
**License:** CC BY 4.0
**Authors:** AVAR Working Group

## 1. Motivation

Prior AVAR versions treated every receipt entry as equivalent "observation." In
practice, observation depth varies by producer. A network-layer producer sees
destination hostnames but not request payloads. An SDK-wrapping producer sees
call arguments but not the underlying transport. An OS-agent producer sees
process metadata but not application intent.

Verifiers and auditors cannot assess trust without knowing **what a producer
actually observed** versus what it inferred or omitted. This RFC formalizes
that distinction — and its limits.

## 2. Terminology

**Evidence.** A single verifiable claim made by a producer about an agent
action. Evidence replaces the informal term "entry" in prior AVAR versions.
The wire field name `entries[]` is retained for compatibility (§7).

**Producer.** Any component that emits AVAR evidence. Producers MAY be network
proxies, SDK wrappers, OS agents, or application-layer instrumentation.

**Evidence type.** The observation class at which evidence was captured (§3).
These are **classes, not depths** — a receipt MAY carry any subset (e.g. an OS
audit log emits `action` evidence with no transport or protocol context).

**Source.** The producer category that captured the evidence (§4).

**Claims.** A boolean vocabulary declaring which evidence fields are directly
observed versus inferred or absent (§5).

## 3. Scope Boundary

AVAR standardizes **verifiable evidence of autonomous execution**. It does
not standardize autonomy architectures, planning models, or governance
workflows.

- AVAR records observable evidence.
- AVAR does not infer cognition.
- Intent, goals, and reasoning belong to producers.
- Governance belongs to producers and runtimes.

> *AVAR records verifiable evidence of autonomous execution. Aarmos interprets
> that evidence into governance concepts such as intent, goals, policies,
> workflows, and compliance.*

Two interoperability rules apply to every producer and verifier and MUST NOT
be broken by future revisions:

1. *Conservative in what you emit, liberal in what you accept.*
2. *Receipts SHOULD remain valid even when consumers do not understand every
   evidence attribute.*

## 4. Evidence Type

Every evidence object SHOULD declare an `evidence_type` field with one of:

| Value | Meaning |
|---|---|
| `transport` | Observed at the network/connection layer (e.g., DNS, TCP, TLS handshake). Destination hostname visible; payload not decoded. |
| `protocol` | Observed at the application protocol layer (e.g., HTTP method + path, MCP frame headers). Structural fields visible; semantic payload may not be. |
| `action` | Observed at the API-call/tool-invocation layer. Call name and arguments visible. |

`intent` is **outside the scope of AVAR**. Producers MUST NOT emit
`evidence_type: "intent"`. Verifiers encountering it in legacy or third-party
receipts MUST warn and accept (§7).

Unknown `evidence_type` values MUST cause verifier warnings but MUST NOT cause
rejection. This preserves forward compatibility with future extensions.

## 5. Source

Every evidence object SHOULD declare a `source` field. Registered values:

| Value | Meaning |
|---|---|
| `network-proxy` | HTTP(S) forward proxy or L4 proxy |
| `sdk-wrapper` | Library-level shim around an agent framework |
| `os-agent` | OS-level daemon observing process/syscall activity |
| `application` | Application-layer instrumentation inside the agent host |
| `broker` | Message broker or event bus between agent components |

Additional values MAY be registered via RFC. Unknown values MUST cause
verifier warnings but MUST NOT cause rejection.

## 6. Claims Block

Every evidence object SHOULD include a `claims` object with the following
boolean fields:

```json
{
  "destination": true,
  "method": true,
  "path_or_call": true,
  "arguments": false,
  "payload_contents": false,
  "response_status": true,
  "response_contents": false,
  "actor_identity": true,
  "session_binding": true
}
```

- `true` — producer directly observed the field and its value in the same
  evidence object is authoritative.
- `false` — producer did not observe the field; its value MUST be omitted or
  set to `null`.

Verifiers MUST reject evidence where `claims.X == false` but field `X` is
populated with a non-null value.

## 7. Evidence Type × Claims Coherence

Producers MUST NOT declare claims inconsistent with their evidence type:

| Evidence type | Maximum claims allowed |
|---|---|
| `transport` | `destination`, `session_binding` |
| `protocol` | above + `method`, `path_or_call`, `response_status` |
| `action` | above + `arguments`, `actor_identity` |

Verifiers MUST reject evidence violating this table with error `E-COHERENCE`.
For unknown evidence types (see §4), coherence checks are skipped and the
verifier emits a warning.

## 8. Wire Compatibility

The receipt JSON retains `entries[]` at the top level. Each entry object
SHOULD carry `evidence_type`, `source`, and `claims`.

**Legacy field name.** The pre-amendment name for `evidence_type` was `depth`.
Verifiers MUST accept `depth` as a synonym for `evidence_type` with a
deprecation warning. Producers MUST NOT emit `depth` on AVAR 1.10+ receipts.

**Legacy values.** `depth: "intent"` MUST be accepted with a warning per §4.

**Pre-1.10 receipts.** Receipts from AVAR ≤ 1.9 MUST be accepted by 1.10
verifiers with implicit defaults:

- `evidence_type: "action"` (conservative — most legacy producers wrapped SDKs)
- `source: "application"`
- `claims`: all `true` for fields present, all `false` for absent

Legacy receipts MUST be marked `legacy: true` in verifier output.

**Unknown extension attributes.** Verifiers MUST NOT reject an entry solely
because it carries additional attributes they do not recognize. Such
attributes are opaque data (§3, rule 2).

## 9. Error Codes

- `E-EVIDENCE-TYPE-INVALID` — `evidence_type` is missing on 1.10+ evidence
  (warning-only if a legacy `depth` synonym is present)
- `E-SOURCE-INVALID` — `source` value not in §5 (warning, not rejection)
- `E-CLAIMS-MISSING` — `claims` object absent or malformed on 1.10+ evidence
- `E-CLAIMS-CONTRADICTION` — field populated where `claims.X == false`
- `E-COHERENCE` — claims exceed evidence-type allowance per §7

The pre-amendment code `E-DEPTH-INVALID` is retained as an alias of
`E-EVIDENCE-TYPE-INVALID` for tooling compatibility.

## 10. Security Considerations

A malicious producer MAY over-claim (declare `evidence_type: action` while
only observing transport). This RFC does not prevent lies; it makes them
auditable. Verifiers and downstream consumers SHOULD cross-reference
`evidence_type` + `source` against known producer capabilities before
granting trust.

## 11. Reference Test Vectors

Normative vectors ship in `Aarmatix/avar-conformance` under
`vectors/rfc-0008/`, including:

- One valid vector for each `evidence_type` value (`transport`, `protocol`,
  `action`).
- Legacy `depth` field accepted with deprecation warning.
- Legacy `depth: "intent"` accepted with warning.
- Unknown `evidence_type` value accepted with warning.
- Unknown extension attribute — receipt still valid.
- Emitter conformance: producers MUST NOT emit `intent`.
