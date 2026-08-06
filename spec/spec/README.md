# Companion object specifications (normative)

These documents specify AVAR objects that have their own lifecycle, separate
from the receipt Entry defined in `../SPEC.md`. They are **normative** and
versioned with the AVAR 1.0 baseline.

| Document | Object |
|---|---|
| `trust-lists.md` | Signed trust lists |
| `trust-manifests.md` | Trust manifests and subscriptions |
| `authority-manifests.md` | Authority-shaped trust manifests |
| `governed-change.md` | Governed change sets (draft → simulate → approve → activate → rollback) |
| `recovery-points.md` | Governance recovery points |
| `trust-boundaries.md` | Declared data contracts, authority-bound credentials |
| `continuity.md` | Continuity witnesses, principal continuity |
| `fork-and-succession.md` | Fork points, hold replication, authority succession |

Each was promoted from a pre-normative addendum. Their `avar/1.x` revision
headers are historical labels; the normative baseline for all of them is
AVAR 1.0. Where a companion document disagrees with `../SPEC.md`, the
disagreement is a specification defect and publication is blocked until the two
agree — see `../SPEC.md` §0.1.
