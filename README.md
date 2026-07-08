# AVAR — Aarmos Verifiable Action Record

**AVAR** is an open specification for verifiable, tamper-evident action records
produced by AI agent runtimes. It is protocol-agnostic: an AVAR can describe an
MCP tool call, an OpenAPI request, a deep-link invocation, or any other action
brokered on behalf of a user.

- **Canonical JSON** shape for a single action
- **Ed25519** signatures over that canonical form
- **Hash-chain** linking successive records into a verifiable bundle
- **Bundle verification** that anyone can run offline, forever

## Verify any AVAR bundle in one command

No install, no account, no network call to us:

```sh
npx -p @aarmos/cli aarmos verify path/to/bundle.avar.zip
```

The verifier is the reference implementation shipped from this repo — see
[`reference/js/`](./reference/js).

## Contents

- [`SPEC.md`](./SPEC.md) — normative specification
- [`CHANGELOG.md`](./CHANGELOG.md) — version history
- [`examples/`](./examples) — sample records and bundles
- [`reference/js/`](./reference/js) — JavaScript reference implementation,
  published to npm as
  [`@aarmos/avar-core`](https://www.npmjs.com/package/@aarmos/avar-core)
  (Apache-2.0, zero dependencies, browser + Node)

## Reference implementation

`reference/js/` is the normative JavaScript reference. An implementation
that disagrees with it on the golden fixtures in
[`reference/js/test/fixtures/`](./reference/js/test/fixtures/) is
non-conformant.

Governance, security policy, and the RFC / breaking-change process live
alongside the code:

- [`reference/js/GOVERNANCE.md`](./reference/js/GOVERNANCE.md)
- [`reference/js/SECURITY.md`](./reference/js/SECURITY.md)
- [`reference/js/SUPPORT.md`](./reference/js/SUPPORT.md)
- [`reference/js/SYNC.md`](./reference/js/SYNC.md) — sync contract with the
  Aarmos product monorepo working copy

Third-party implementations in other languages are welcome under Apache-2.0.

## Status

`1.0` — stable wire format. Non-breaking extensions land as `avar/1.x`.
Breaking changes bump the major and are called out in `CHANGELOG.md`.

## License

- Specification and prose: [Apache-2.0](./LICENSE)
- Reference implementation: [Apache-2.0](./reference/js/LICENSE)
- Example code: Apache-2.0

Contributions are welcome via pull request; by contributing you agree to license
your contribution under Apache-2.0.
