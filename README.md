# AVAR — Aarmos Verifiable Action Record

**AVAR** is an open specification for verifiable, tamper-evident action records
produced by AI agent runtimes. It is protocol-agnostic: an AVAR can describe an
MCP tool call, an OpenAPI request, a deep-link invocation, or any other action
brokered on behalf of a user.

- **Canonical JSON** shape for a single action
- **Ed25519** signatures over that canonical form
- **Hash-chain** linking successive records into a verifiable bundle
- **Bundle verification** that anyone can run offline, forever

The reference implementation is published on npm as
[`@aarmos/avar-core`](https://www.npmjs.com/package/@aarmos/avar-core) —
zero-dependency, browser + Node.

## Contents

- [`SPEC.md`](./SPEC.md) — normative specification
- [`CHANGELOG.md`](./CHANGELOG.md) — version history
- [`examples/`](./examples) — sample records and bundles

## Status

`1.0.0-rc` — release-candidate. Breaking changes will bump the major and be
called out in `CHANGELOG.md`.

## License

- Specification and prose: [Apache-2.0](./LICENSE)
- Example code: Apache-2.0

Contributions are welcome via pull request; by contributing you agree to license
your contribution under Apache-2.0.
