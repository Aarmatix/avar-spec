# AVAR SPEC — Addendum 1.3 (Schema Contracts, Phase 1)

**Status:** additive, no wire-format bump. Producers MAY emit; verifiers
MUST tolerate. Compatible with any `avar/1` bundle.

## Motivation

The #1 dev-side question about an agent run is *"did it produce what I
expected?"*. Today the receipt answers *what happened* (tool, args,
output preview, decision, timing). It doesn't answer *whether the shape
matched the caller's expectations*. Schema Contracts add that verdict as
a first-class, hash-chained field on the tool step — so contract
violations show up in the receipt itself, not as a thrown exception the
caller may or may not surface.

## Wire shape

A `ToolStep` MAY carry an additional optional field:

```json
{
  "kind": "tool",
  "tool": "https.fetch",
  "argsRedacted": { "url": "https://example.com" },
  "outputPreview": "…",
  "ok": true,
  "ms": 12,
  "contract": {
    "in":  "pass" | "fail" | "absent",
    "out": "pass" | "fail" | "absent",
    "violations": ["in: $.url: pattern"],
    "fingerprint": "deadbeef"
  }
}
```

Semantics:

- `absent` means "no contract was declared for this tool at call time".
  It is **not** a failure. A tool with no contract is indistinguishable
  from before this addendum.
- `pass` / `fail` are shape verdicts only. `ok` remains authoritative for
  *whether the underlying call succeeded*; the two are independent.
- `violations` is a bounded list of short strings suitable for a receipt
  view. Producers SHOULD cap length (~10 entries) to keep receipts small.
- `fingerprint` is a stable identifier for the contract that produced the
  verdict — advisory only, not a trust anchor.

## Hash & chain invariants

- `contract` is included in `computeStepHash` because it is part of the
  step object. Producers that omit it produce byte-identical hashes to
  the pre-1.3 shape (proven by `test/forward-compat.test.ts` case G).
- Verifiers that don't know about `contract` treat it as opaque data per
  spec §3 (unknown-field tolerance). No verifier change is required.

## Runtime behavior (T2.1 Phase 1)

- Contracts are stored on-device (browser: `localStorage`; CLI: on-disk
  under `contracts/*.schema.json`).
- Mode is per-contract:
  - `warn` (default) → verdict is recorded; run outcome unchanged.
  - `strict` → a failing pre-call verdict escalates to a gate DENY via
    the existing decision path (`source: "contract"`,
    `reason: "contract_violation: …"`). No new gate primitive.
- **Phase 1 is validate-only.** Auto-repair / coercion is explicitly
  deferred to Phase 2 (the `OBLIGATION_RETRY` async boundary). We
  specify the shape now so Phase 2 is a pure additive.

## Explicitly out of scope for Phase 1

- Automatic coercion of args or output to satisfy the schema.
- Contract sharing, signing, or marketplaces.
- Cross-tool contract composition.

## Producer checklist

- [ ] Include `contract` on a `ToolStep` only when a contract exists for
      that tool at call time. Omit the field otherwise.
- [ ] Keep `violations` short and human-readable.
- [ ] Never populate `contract` retroactively — the verdict is bound to
      the step hash at chain-append time.

## Verifier checklist

- [ ] Do nothing new. `contract` is opaque data.
- [ ] Reject bundles only for the reasons already listed in spec §5.
