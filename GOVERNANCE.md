# AVAR Governance

**License:** CC BY 4.0
**Status:** v1.0 — initial

## Mission

AVAR (Agent Verification And Receipts) is an open standard for verifiable
evidence of AI agent actions. Its purpose is interoperability: any producer,
any verifier, any auditor, no vendor lock-in.

## Maintainer

Aarmatix LLC (Delaware, USA) is the initial maintainer. Aarmatix commits to
transferring stewardship of AVAR to a neutral governance body once **three or
more independent implementations** exist and demonstrate conformance.

"Independent" means: distinct legal entity, distinct authorship, no shared
code lineage with the reference verifier at `Aarmatix/avar`.

## Change Process

All normative changes to AVAR are made via RFC:

1. Open an issue in `Aarmatix/avar-spec` labeled `rfc-proposal` describing
   the motivation and proposed change.
2. If accepted for consideration, open a PR adding
   `RFC-NNNN-<slug>.md` under the spec root.
3. RFC lifecycle: `Draft` → `Last Call` (30 days minimum) → `Accepted` or
   `Rejected`.
4. Accepted RFCs are merged into the target AVAR version per VERSIONING.md.

## Roles

- **Maintainer** — Aarmatix LLC; final merge authority on RFC status changes
  until neutral-body transfer.
- **Editors** — approve non-normative edits (typos, clarifications, examples).
  Editor list is in `EDITORS.md`.
- **Contributors** — anyone who opens issues, RFC drafts, or PRs.

## Voting

While Aarmatix is sole maintainer, RFC decisions rest with Aarmatix. Once
≥3 independent implementations exist, RFC decisions require a public vote
open to implementer representatives. Vote mechanics will be specified in a
governance amendment at that time.

## Conformance and Trademark

"AVAR" and "AVAR Compatible" are proposed certification marks of Aarmatix
LLC. Certification will be granted based on passing the public conformance
suite at `Aarmatix/avar-conformance`. No fee is charged for certification of
open-source implementations. Terms will be published before the mark issues.

## Code of Conduct

All participation is subject to the Contributor Covenant v2.1 (see
`CODE_OF_CONDUCT.md`).

## Contact

- Issues and RFCs: `Aarmatix/avar-spec` GitHub
- Security: security@aarmos.io (PGP key in `SECURITY.md`)

## Amendments

This document may be amended by RFC. Amendments require 60-day Last Call.
