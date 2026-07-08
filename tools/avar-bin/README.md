# `avar` — standalone AVAR receipt verifier

Single-file executable for verifying `.avar.zip` bundles offline. Zero
network, zero Aarmos daemon. Ships as five prebuilt binaries on every
`avar-spec` release.

## Install

Prebuilt binaries: <https://github.com/Aarmatix/avar-spec/releases/latest>

Platforms:

- `avar-darwin-arm64` — macOS Apple Silicon
- `avar-darwin-x64` — macOS Intel
- `avar-linux-x64` — Linux x86_64
- `avar-linux-arm64` — Linux arm64
- `avar-windows-x64.exe` — Windows x86_64

Checksums: `SHA256SUMS` on the same release page.

## Usage

```
avar verify <receipt.avar.zip> [--json] [--quiet] [--strict]
avar --version
avar --help
```

Exit codes: `0` valid (or `valid-with-warnings` without `--strict`),
`1` invalid / malformed / unreadable, `2` file not found, `3` usage error.

## Build from source

Requires [Bun](https://bun.sh) ≥ 1.3.

```
bun install
bun run build          # produces out/avar-<os>-<arch>[.exe] for all 5 targets
bun run build:host     # single binary for the host platform only
```

Or manually:

```
bun build ./avar.ts --compile --minify --target=bun-linux-x64 --outfile out/avar-linux-x64
```

## What it verifies

The binary embeds
[`@aarmos/avar-core`](https://www.npmjs.com/package/@aarmos/avar-core)
v1.0.0. It reproduces the same `VerificationReport` as the browser
drop-zone at `/trust/verify` and the `aarmos verify` subcommand — that's
the parity guarantee (see `reference/js/test/fixtures/`).

## License

Apache-2.0. Same as the rest of `avar-spec`.
