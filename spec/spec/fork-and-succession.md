# SPEC-ADDENDUM-1.18 — Fork points, hold replication, authority succession

- Status: Accepted
- Date: 2026-08-03
- Wave: 18 (Preserving Truth Under Growth), stage S6
- Spec id: `avar/fork/1.0`
- Related: ADR-0008 (recovery points), ADR-0011 (governed object
  continuity), ADR-0013 (legal hold), ADR-0018 (multi-team authority),
  ADR-0019 (authority succession and fork semantics)

This addendum is additive. No existing field changes meaning, and no
existing artifact becomes invalid.

## 1. Fork point

A **fork point** is a recovery point sealed as part of a split event and
referenced by both successors.

```json
{
  "fork_id": "fork-2026-08-03-eu-us",
  "spec": "avar/fork/1.0",
  "recovery_point_digest": "sha256:…",
  "predecessor": "acme",
  "successors": ["acme-eu", "acme-us"],
  "last_shared_index": 412,
  "at": 1785000000
}
```

Rules:

1. `successors` MUST contain exactly two entries. A three-way split MUST be
   expressed as two sequential forks.
2. Both successors MUST carry a byte-identical `recovery_point_digest`.
3. `last_shared_index` is the chain index of the final shared entry.

## 2. Verification across a fork

A verifier presented with two chains that share a prefix returns exactly
one verdict:

| Verdict | Condition |
| --- | --- |
| `common-history-verified-to-fork` | a fork point is present, the chains are its named successors, and they agree at least through `last_shared_index` |
| `distinct-chains` | the chains presented are not the successors named in the fork point |
| `unresolved-continuity` | no fork point, or the chains agree on less history than the fork point claims |

A shared prefix alone MUST NOT produce a common-history claim. False
continuity is more harmful than unresolved continuity.

## 3. Legal hold at a fork

1. A hold in force at the fork MUST replicate to **both** successors.
2. Release authority MUST NOT replicate implicitly.
3. Where release authority in a successor cannot be determined, the items
   MUST remain retained. Unresolved release authority is retention.

## 4. Custody duplication preconditions

At the split event, each successor MUST demonstrate:

- possession of its own byte-complete copy of the fork point;
- independent verification of that copy with a verifier of its own choosing;
- control of a trust root distinct from its peer's.

A split failing any precondition MUST be refused, not applied and
reconciled later.

## 5. Human authority succession

Succession is carried by governed events. A handover event orderable
against the outgoing authority's last activity yields `successor`;
otherwise `unresolved`.

A human **continuity assertion** MAY be recorded alongside the evidence
outcome. It MUST NOT change it. Consumers MUST render the two separately.
