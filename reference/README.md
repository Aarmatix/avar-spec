# AVAR Reference Implementations

Apache-2.0 reference code for the [AVAR spec](../spec/). These are the
canonical implementations third parties can read, cite, fork, or
re-implement against.

**These are not the Aarmos runtime.** The runtime is a separate product
that produces AVAR receipts; anything in this directory only *verifies*
receipts and manipulates the on-wire formats.

## Contents

| Path | Purpose | License |
| --- | --- | --- |
| [`js/avar-core`](./js/avar-core) | TypeScript library + `avar` CLI: `verify`, `diff` for receipts, policies, manifests | Apache-2.0 |
| [`js/avar-verify-wasm`](./js/avar-verify-wasm) | WASM build of the verifier for browsers and non-JS hosts | Apache-2.0 |

Published to npm as `@aarmos/avar-core` and `@aarmos/avar-verify-wasm`.
This directory is the source of truth; npm tarballs are built from the
same tree.

## Stability

The spec under [`../spec/`](../spec/) is normative. If the reference
code and the spec disagree, the spec wins and the code is the bug.

## Contributing

Bug reports and interoperability fixes welcome. New verifier features
should start as a spec PR. See `SECURITY.md` for coordinated disclosure.
