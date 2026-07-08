# AVAR Specification

Version: 1.0.0-rc

> This document uses the key words MUST, SHOULD, and MAY per RFC 2119.

## 1. Purpose

AVAR (Aarmos Verifiable Action Record) defines a canonical, signed, hash-chained
record of an action performed by an AI agent runtime on behalf of a user. AVAR
is **protocol-agnostic**: it describes *that an action happened and what it did*,
independent of the transport (MCP, OpenAPI, deep-link, custom API, etc.).

## 2. Record shape

An AVAR record is a JSON object with the following top-level fields:

| Field       | Type    | Required | Description                                                   |
|-------------|---------|----------|---------------------------------------------------------------|
| `v`         | string  | yes      | Spec version, e.g. `"1.0.0-rc"`                               |
| `id`        | string  | yes      | ULID or UUIDv7 identifying the record                         |
| `ts`        | string  | yes      | RFC 3339 timestamp with millisecond precision, UTC (`Z`)      |
| `actor`     | object  | yes      | `{ "runtime": string, "version": string }`                    |
| `subject`   | object  | yes      | `{ "kind": string, "id": string }` — who the action is for    |
| `action`    | object  | yes      | `{ "protocol": string, "name": string, "args_hash": string }` |
| `result`    | object  | yes      | `{ "status": "ok" \| "denied" \| "error", "hash": string }`   |
| `prev`      | string  | yes      | Hash of the previous record in the chain, or 32 zero bytes    |
| `sig`       | string  | yes      | Ed25519 signature over the canonical form                     |
| `pubkey`    | string  | yes      | Base64url-encoded Ed25519 public key of the signer            |

All hashes are SHA-256, hex-encoded lowercase.

## 3. Canonical form

Before signing or hashing, the record MUST be serialized as canonical JSON:

1. Remove the `sig` field.
2. Sort object keys lexicographically at every depth.
3. Use minimal JSON (no insignificant whitespace).
4. Encode numbers with the shortest round-trip representation.
5. Encode strings as UTF-8, escaping only what JSON requires.

The signature covers the SHA-256 of this canonical form.

## 4. Hash chain

`prev` MUST equal the SHA-256 of the canonical form of the previous record in
the same bundle. The first record in a bundle MUST set `prev` to
`"0000000000000000000000000000000000000000000000000000000000000000"`.

## 5. Bundle verification

A verifier MUST:

1. Recompute each record's canonical form and hash.
2. Verify each `sig` against `pubkey` over that hash.
3. Verify each `prev` matches the previous record's hash.
4. Reject the bundle on any mismatch.

Verification MUST be possible offline, using only the bundle and the public key
material embedded in it.

## 6. Protocol independence

`action.protocol` is a free-form identifier. Reserved values include:

- `mcp` — Model Context Protocol tool call
- `openapi` — OpenAPI-described HTTP call
- `deeplink` — OS-level deep-link invocation
- `custom` — implementation-defined

Implementations MAY register additional protocol identifiers; unknown values
MUST NOT cause verification to fail.

## 7. Security considerations

- Private keys MUST NEVER leave the signer's device.
- Verifiers MUST NOT trust `ts` for ordering; the hash chain is authoritative.
- `args_hash` and `result.hash` allow arguments and results to be omitted from
  the record while remaining verifiable against out-of-band storage.

## 8. Change process

Breaking changes bump the major version. Non-breaking clarifications bump the
patch. Every change is recorded in `CHANGELOG.md`.
