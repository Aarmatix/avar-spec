# Sync policy: this working copy ↔ `Aarmatix/avar-spec`

The canonical home of `@aarmos/avar-core` is
[`Aarmatix/avar-spec/reference/js`](https://github.com/Aarmatix/avar-spec/tree/main/reference/js).
This `packages/avar-core/` directory in the Aarmos product monorepo is a
**working copy**: it exists so the PWA, CLI, and recorder can iterate
against unreleased verifier changes without a two-repo dance.

The two must never drift. Drift means the shipped verifier disagrees
with the spec — the exact failure mode AVAR exists to prevent.

## Rules

1. **Spec repo is upstream.** Every commit that touches
   `packages/avar-core/{src,test,README.md,GOVERNANCE.md,SECURITY.md,SUPPORT.md,LICENSE,NOTICE,package.json,tsup.config.ts}`
   must land in `Aarmatix/avar-spec/reference/js/` in the same PR window.
2. **npm publishes from the spec repo.** `npm publish` for
   `@aarmos/avar-core@X.Y.Z` is cut from a tagged commit on
   `Aarmatix/avar-spec`, never from this monorepo. This working copy
   never runs `npm publish` directly.
3. **Version bumps are coordinated.** Bumping `version` in this
   `package.json` is only allowed once the same bump has been pushed to
   the spec repo and tagged (`avar-core-vX.Y.Z`).
4. **Third-party changes upstream first.** External contributors PR to
   `Aarmatix/avar-spec`. We mirror the merged commit into this working
   copy in the next monorepo change.
5. **Divergence audit.** Any release checklist for `@aarmos/avar-core`
   includes a diff between this directory and
   `avar-spec/reference/js/`. A non-empty diff blocks the release.

## Sync direction, by change type

| Change                                          | Where it starts             | Where it must also land   |
| ----------------------------------------------- | --------------------------- | ------------------------- |
| Verifier bug fix caught while shipping the PWA  | This working copy           | `avar-spec` (same window) |
| Spec RFC / new required field                   | `avar-spec` (RFC PR)        | This working copy on merge |
| External contributor patch                      | `avar-spec` PR              | This working copy on merge |
| Governance / SECURITY / SUPPORT edits           | `avar-spec`                 | This working copy         |
| npm release (tag + publish)                     | `avar-spec` (tagged commit) | n/a — this copy never publishes |

## What the two copies must match, byte-for-byte

- `src/**`
- `test/**` (including `test/fixtures/**` — the interop contract)
- `GOVERNANCE.md`, `SECURITY.md`, `SUPPORT.md`, `LICENSE`, `NOTICE`, `README.md`
- `package.json` `name`, `version`, `license`, `repository`, `exports`, `files`

Divergence in build tooling (`tsup.config.ts`) or lockfile is allowed
if it doesn't change the shipped `dist/`.
