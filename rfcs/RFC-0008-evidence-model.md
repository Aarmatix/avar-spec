# RFC-0008: Evidence Model

**Status:** Draft
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
that distinction.

## 2. Terminology

**Evidence.** A single verifiable claim made by a producer about an agent
action. Evidence replaces the informal term "entry" in prior AVAR versions.
The wire field name `entries[]` is retained for compatibility (§7).

**Producer.** Any component that emits AVAR evidence. Producers MAY be network
proxies, SDK wrappers, OS agents, or application-layer instrumentation.

**Depth.** The observation layer at which evidence was captured (§3).

**Source.** The producer category that captured the evidence (§4).

**Claims.** A boolean vocabulary declaring which evidence fields are directly
observed versus inferred or absent (§5).

## 3. Depth

Every evidence object MUST declare a `depth` field with exactly one of:

| Value | Meaning |
|---|---|
| `transport` | Observed at the network/connection layer (e.g., DNS, TCP, TLS handshake). Destination hostname visible; payload not decoded. |
| `protocol` | Observed at the application protocol layer (e.g., HTTP method + path, MCP frame headers). Structural fields visible; semantic payload may not be. |
| `action` | Observed at the API-call/tool-invocation layer. Call name and arguments visible. |
| `intent` | Observed at the agent-reasoning layer. Prompt/plan visible. |

Depth is monotonic: `intent` producers MAY also emit `action`-depth evidence.
Verifiers MUST NOT assume a producer sees deeper than declared.

## 4. Source

Every evidence object MUST declare a `source` field with exactly one of:

| Value | Meaning |
|---|---|
| `network-proxy` | HTTP(S) forward proxy or L4 proxy |
| `sdk-wrapper` | Library-level shim around an agent framework |
| `os-agent` | OS-level daemon observing process/syscall activity |
| `application` | Application-layer instrumentation inside the agent host |
| `broker` | Message broker or event bus between agent components |

Additional values MUST be registered via RFC. Unknown values MUST cause
verifier warnings but not rejection.

## 5. Claims Block

Every evidence object MUST include a `claims` object with the following
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

## 6. Depth × Claims Coherence

Producers MUST NOT declare claims inconsistent with their depth:

| Depth | Maximum claims allowed |
|---|---|
| `transport` | `destination`, `session_binding` |
| `protocol` | above + `method`, `path_or_call`, `response_status` |
| `action` | above + `arguments`, `actor_identity` |
| `intent` | all fields |

Verifiers MUST reject evidence violating this table with error `E-COHERENCE`.

## 7. Wire Compatibility

The receipt JSON retains `entries[]` at the top level. Each entry object gains
three required fields: `depth`, `source`, `claims`. Receipts from AVAR ≤1.9
MUST be accepted by 1.10 verifiers with implicit defaults:

- `depth: "action"` (conservative — most legacy producers wrapped SDKs)
- `source: "application"`
- `claims`: all `true` for fields present, all `false` for absent

Legacy receipts MUST be marked `legacy: true` in verifier output.

## 8. Error Codes

- `E-DEPTH-INVALID` — `depth` value not in §3
- `E-SOURCE-INVALID` — `source` value not in §4 (warning, not rejection)
- `E-CLAIMS-MISSING` — `claims` object absent on 1.10+ evidence
- `E-CLAIMS-CONTRADICTION` — field populated where `claims.X == false`
- `E-COHERENCE` — claims exceed depth allowance per §6

## 9. Security Considerations

A malicious producer MAY over-claim (declare `depth: intent` while only
observing transport). This RFC does not prevent lies; it makes them auditable.
Verifiers and downstream consumers SHOULD cross-reference `depth`+`source`
against known producer capabilities before granting trust.

## 10. Reference Test Vectors

Normative vectors ship in `Aarmatix/avar-conformance` under
`vectors/rfc-0008/`.
