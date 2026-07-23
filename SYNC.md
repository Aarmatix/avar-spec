# Sync policy

This repository is the canonical source for the **AVAR (Aarmos Verifiable
Action Record) specification** — the normative text under `spec/`, the
governance under `GOVERNANCE.md`, and the RFC process under `rfcs/`.

The **reference implementation** lives in a separate public repository at
[`Aarmatix/avar`](https://github.com/Aarmatix/avar) and is published on npm
as [`@avar-standard/core`](https://www.npmjs.com/package/@avar-standard/core)
and [`@avar-standard/verify`](https://www.npmjs.com/package/@avar-standard/verify).
Conformance vectors live in
[`Aarmatix/avar-conformance`](https://github.com/Aarmatix/avar-conformance).

## Rules

1. **Spec changes land here first** via PR against `main`, following the
   RFC process in `rfcs/`.
2. **Every accepted RFC ships with a spec revision** and a matching
   `CHANGELOG.md` entry.
3. **Reference-implementation changes** track spec revisions and are
   released from `Aarmatix/avar` under the `@avar-standard` scope.
4. **Historical note.** Prior to 2026-07-22, this repo also carried a
   `reference/js/` mirror of the reference implementation. That mirror
   is retired — install `@avar-standard/core` from npm, or clone
   `Aarmatix/avar`, instead.
