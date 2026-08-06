# AVAR normative fixtures

**Status: normative.** These fixtures are part of the AVAR 1.0 specification
(`../SPEC.md` §9). Where a fixture and the prose disagree, that disagreement is
a specification defect and blocks publication — neither side silently wins.

## What is here

Each fixture is an `avar/1` bundle archive plus its expected verification
result, recorded in `index.json`:

| field | meaning |
| --- | --- |
| `expected.verdict` | `valid`, `valid-with-warnings`, `closed`, or `invalid` |
| `expected.readability` | whether a verifier may state a semantic verdict at all |
| `expected.issueKinds` | the sorted set of issue kinds a conformant verifier reports |
| `expected.*Count` | entry, signed, unsigned, and unchained counts |
| `sha256` | digest of the archive, so drift is detectable byte-for-byte |

`closed` is a success verdict: every integrity check passed and the chain
states that it is finished.

## Coverage

| fixture | what it pins down |
| --- | --- |
| `01-empty` | a bundle with no entries is valid, not an error |
| `02-single-signed` | the minimum conformant signed entry |
| `03-multi-chain` | entry-to-entry hash chaining |
| `04-step-chain` | per-step chaining inside one entry |
| `05-unsigned-unchained` | unsigned evidence degrades to a warning, never to a silent pass |
| `06-unicode-edge` | canonicalization across NFC/NFD, CJK, and ZWJ sequences |
| `07-optional-evidence` | declared intent, declared target, classification, remediable denial, governance, lineage, and an unknown `x-*` field surfaced as unresolved |
| `08-agent-signed` | agent identity and agent signature over the tail step hash |
| `09-closed-chain` | a terminal closure marker |
| `10-tampered-signature` | a flipped signature byte is caught |
| `11-broken-chain` | an altered `prevHash` is caught |
| `12-digest-mismatch` | entries that do not match the manifest digest are caught |
| `13-future-major` | a later MAJOR produces refusal, not a guess |
| `14-decision-allow` | the optional Decision envelope: schema pinned by version **and** hash, runtime-assigned provenance, a bounded execution window |
| `15-decision-unable` | a participant that could not evaluate records `unable` plus a reason, resolved by its declared posture — never an ALLOW, and never indistinguishable from a considered DENY |

## Regenerating

Fixtures are generated, never hand-edited. Every key, id, and timestamp in the
generator is fixed, so the archives are byte-reproducible on any machine.

```bash
bunx tsx scripts/avar-fixtures.ts           # regenerate
bunx tsx scripts/avar-fixtures.ts --check   # fail on any drift
```

## The launch gate

```bash
node scripts/avar-launch-gate.mjs
```

Installs the published `@avar-standard/verify` from npm — no access to this
repository — and requires it to reproduce every expectation above. No external
party receives a produced artifact while that gate is closed.
