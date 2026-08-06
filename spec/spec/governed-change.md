# SPEC-ADDENDUM-1.12 — Governed Change

- Status: Accepted
- Applies to: `avar/1.x` receipts (see SPEC.md §3, §4, §6)
- Related: 1.9 (Governance provenance), 1.10 (Cross-receipt lineage), 1.11 (Chain closure)

## Summary

1.12 defines **Change** as a governed object: a proposed transition to
governance state that produces evidence as it moves, rather than a silent
edit that is only visible by its after-effects.

The invariant:

> A Change is a proposed transition to governance state.
> Every lasting modification to governance state enters the system as a Change.

"Governance state" means state that can alter a future decision: policy
rules, agent lifecycle, authority grants and delegations, connector
bindings, retention configuration, and role assignments. Ephemeral state
(view preferences, drafts, filters) is not governance state and is out of
scope.

A Change is not a diff. A diff describes text; a Change describes a
transition with an analysis of who depends on it, a simulation of what it
would have done to recorded history, an approval, an application, and a
verification that live state matches what was approved.

Verifiers that do not implement 1.12 MUST treat change receipts as ordinary
receipts and include their fields in canonical JSON per §2. Chain and
signature semantics are unchanged.

## 1. Lifecycle

A Change occupies exactly one state:

```text
draft → analyzed → simulated → approved → applied → verified
                                             │
                                             └──→ rolled_back
```

- `draft` — proposed, incomplete, produces no receipts. A discarded draft
  leaves no evidence because it asserted nothing.
- `analyzed` — blast radius, dependencies, and conflicts computed from
  recorded evidence.
- `simulated` — recorded invocations re-judged under the candidate state.
- `approved` — a human accepted the analyzed and simulated proposal.
  **Receipted.**
- `applied` — live governance state mutated. **Receipted.** An application
  refused by a precondition emits an `APPLY_BLOCKED` receipt; the refusal is
  evidence and MUST NOT be discarded.
- `verified` — live state re-read and confirmed to match the proposal.
  **Receipted.**
- `rolled_back` — a terminal marker set when an inverse Change is applied.
  **Receipted.**

Rollback is forward motion. A Change is undone by applying its inverse, never
by rewriting or deleting the original Change or the receipts it produced.

## 2. Simulation Determinism (architectural invariant)

> Two Change Sets containing the same transitions MUST produce identical
> analysis and simulation results, regardless of the order in which those
> transitions were added.

Implementations MUST canonicalize the item set before analysis, simulation,
or digest computation: sort by `(kind, target, verb)`, deduplicate by
`item_id`, and derive `item_id` from the canonical JSON of the transition
itself — never from insertion order, timestamps, or UI state.

Simulation MUST be a re-judgement of recorded evidence, not a prediction. A
recorded invocation that cannot be honestly re-judged under the candidate
state MUST be reported as not-evaluable and MUST NOT be counted as unchanged.
Simulation coverage MUST be surfaced alongside any simulation result.

## 3. Preconditions

An `applied` transition MUST re-evaluate its preconditions at apply time, not
only at approval time. Evaluating them once at approval would let a Change
apply into a workspace that has since drifted.

Defined preconditions in 1.12:

- `no-conflicts` — no other pending Change transitions the same governance
  target. Implementations MUST NOT auto-merge overlapping Changes.
- `approvals-present` — at least the configured number of recorded approval actors (default one).
- `no-emergency-grants` — no unbounded authority grant is currently open.
- `replay-coverage` — simulation coverage meets the configured threshold.

Unknown precondition kinds MUST be treated as blocking, not as passing.

## 4. Receipt fields

Change receipts are ordinary receipts whose decision carries
`source: "governance-change"` and one of:

```text
APPROVED | APPLIED | VERIFIED | ROLLED_BACK | APPLY_BLOCKED
```

The decision note carries, in this order when present:

```text
digest=<first 16 hex of the canonical set digest>
items=<count>
kinds=<sorted, pipe-joined governance state kinds>
would_change=<count of recorded decisions the simulation re-judged differently>
blocked_by=<sorted, pipe-joined precondition kinds>   (APPLY_BLOCKED only)
rollback_of=<change set id>                            (inverse changes only)
actor=<approving or applying actor>
receipts=retained
```

`digest` is the content digest of the canonical item set (§2). Two Changes
with the same digest propose the same transition, whatever their titles or
authoring order.

Change receipts SHOULD carry the control frameworks `soc2:cc8.1` (change
management) and `iso-42001:8.4`.

## 5. What 1.12 does not do

- It does not merge, rebase, or reconcile conflicting Changes. Conflict is
  surfaced; ordering is a human decision.
- It does not predict outcomes. There is no model, no scoring, no forecast —
  only re-judgement of what was actually recorded.
- It does not permit erasure. `rolled_back` marks history; it does not remove
  it. Evidence remains append-only per 1.11.
