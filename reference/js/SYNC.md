# Sync policy: this working copy ↔ `Aarmatix/avar-spec`

The `@aarmos/avar-core` package is co-maintained between this monorepo
working copy and the public
[`Aarmatix/avar-spec`](https://github.com/Aarmatix/avar-spec) repo
(where the JS reference lives under `reference/js/`, spec docs under
`spec/`, and ADRs under `adr/`).

## Policy (v2, 2026-07-15)

**Monorepo is the source of truth.** Every runtime change to the
verifier lands here first because the PWA, CLI, and recorder ship
against this tree. The spec repo is an **auto-mirrored published view**
plus an **external-contributor entry point**. Policy v1 said the
opposite; it produced 1.9 → 1.13 silent drift, so we inverted it.

## Rules

1. **Publish from the monorepo.** `npm publish` for
   `@aarmos/avar-core@X.Y.Z` runs here. A `postpublish` hook runs
   `scripts/mirror-schema-specs.mjs avar-core`, which force-updates
   `avar-spec@main` and creates a `avar-core-vX.Y.Z` tag.
2. **Every version is tagged in avar-spec.** Registry provenance and
   the spec repo agree byte-for-byte at each tag.
3. **CI drift gate.** `.github/workflows/avar-core-drift.yml` diffs
   this directory against `avar-spec@<last-published-tag>` on every PR
   that touches `src/`, `test/`, or `package.json`. Non-empty diff
   blocks merge; the fix is to publish (which re-mirrors) or update
   the pinned tag.
4. **External PRs land on `avar-spec`.** A maintainer cherry-picks the
   merged commit into this working copy within one release cycle.
5. **Do not commit directly to `avar-spec@main`.** The next mirror push
   force-updates it. Land changes here, then publish.

## What the mirror ships to avar-spec

- `reference/js/` — the full contents of this directory (except
  `node_modules`, `dist`, lockfiles).
- `spec/` — the contents of `docs/avar/` (SPEC.md, addenda, CHANGELOG).
- `adr/` — the contents of `docs/adr/`.
- `SYNC.md` at repo root — the external-contributor entry point.
