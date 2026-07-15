# Sync policy: this spec repo ↔ Aarmos monorepo working copy

The **aarmos.avar/1** contract is co-maintained between this public spec
repo and the Aarmos monorepo working copy at `packages/avar-core/`.

## Policy (v2, 2026-07-15)

**Monorepo is the source of truth.** The runtime, PWA, and CLI iterate
against the working copy every day, so keeping the spec repo as a
separate upstream created chronic drift. This repo is now an
**auto-mirrored published view** of the monorepo working copy plus an
**external-contributor entry point**.

## Rules

1. **Monorepo publishes; this repo mirrors.** `npm publish` for
   `@aarmos/avar-core@X.Y.Z` runs from the monorepo and a `postpublish`
   hook (`scripts/mirror-schema-specs.mjs`) pushes the exact
   published tree here in the same commit.
2. **Every published version is tagged here** as `avar-core-vX.Y.Z`
   so registry provenance and this repo agree byte-for-byte.
3. **External contributors PR to this repo.** Merged commits are
   cherry-picked into the monorepo working copy within one release
   cycle. The CI drift gate in the monorepo blocks any release where
   the two have diverged.
4. **Direct commits to `main` here are auto-overwritten** by the next
   mirror push. Use PRs against tagged commits, not `main` HEAD.
