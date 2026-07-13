# Extension namespace: `x-preflight`

**Status:** Reserved in `avar/1.2`. Additive, fully back-compatible with
`avar/1.0` and `avar/1.1` — verifiers unaware of the namespace MUST
treat `x-preflight` fields as opaque data included in canonical JSON
per §2 (Canonicalization), so `entryHash` and the ed25519 signature
cover them byte-exactly.

## Motivation

`aarmos preflight` is a pre-execution gate that runs before any tool
call. It bundles three checks and emits a single signed receipt:

1. **Matrix Lint (M1).** Verifies the 8×8 Action × Resource policy
   compiles, has no unreachable rows, and satisfies the DRAFT-6
   Attenuation rule (D1) — a scoped invite cannot widen its issuer's
   grants.
2. **Capability Attestation (D1).** Confirms the declared scope is a
   subset of the parent grant chain; records the device pubkey
   fingerprint that will sign runtime receipts.
3. **Environmental Context.** Deterministic checks: workspace exists,
   `.gitignore` covers `.aarmos/`, no obvious secrets in tracked
   files (entropy + provider prefix heuristics), listening-port sanity.

Persisting the result inside the AVAR chain lets any replay prove that
the environment was clean at the time of execution — not just at
commit time.

## Wire format

The preflight receipt is a normal `AvarEntry` with `kind:
"preflight"` and an `x-preflight` object on the entry body:

```json
{
  "kind": "preflight",
  "decision": "PREFLIGHT_PASS",
  "x-preflight": {
    "v": 1,
    "policyDigest": "sha256:…",
    "capabilityDigest": "sha256:…",
    "env": {
      "workspace": "ok",
      "gitignore": "ok",
      "secrets": { "scanned": 42, "findings": 0 },
      "ports": "ok"
    },
    "durationMicros": 12873
  }
}
```

| Field                       | Type    | Required | Notes |
|-----------------------------|---------|----------|-------|
| `v`                       | int     | yes      | Extension version. Currently `1`. |
| `policyDigest`            | string  | yes      | SHA-256 hex of the canonical 8×8 matrix that lint passed against. |
| `capabilityDigest`        | string  | yes      | SHA-256 hex of the canonical grant chain the scope attested against. |
| `env.workspace`           | string  | yes      | `"ok"` | `"missing"` | `"dirty"`. |
| `env.gitignore`           | string  | yes      | `"ok"` | `"missing"` | `"incomplete"`. |
| `env.secrets.scanned`     | int     | yes      | Number of tracked files scanned. |
| `env.secrets.findings`    | int     | yes      | Count of high-confidence secret matches. Non-zero forces `PREFLIGHT_FAIL` in `--strict`. |
| `env.ports`               | string  | yes      | `"ok"` | `"conflict"`. |
| `durationMicros`          | int     | no       | Wall-clock cost, for perf regression alerts. |

Additional keys under `x-preflight` are reserved for future minor
revisions of the extension and MUST be preserved verbatim by `avar
diff` and `aarmos replay --verify-chain`.

## Verdicts

`avar/1.2` reserves two additive `decision` values for entries
carrying `x-preflight`:

- `PREFLIGHT_PASS` — every check returned `ok` and `secrets.findings` is `0`.
- `PREFLIGHT_FAIL` — at least one check failed OR `secrets.findings` > 0 under `--strict`.

Downstream policies MAY refuse to execute a run whose parent chain does
not include a matching `PREFLIGHT_PASS` within a configured freshness
window. That policy is orthogonal to the spec — the extension merely
guarantees the receipt is verifiable and covered by the chain.

## Sidecar storage

The reference CLI stores each preflight receipt at
`.aarmos/preflight/<sha256(policyDigest||capabilityDigest)>.json`.
Sidecar storage is a CLI convention, not part of the spec — bundle
verifiers rely only on the AVAR entry.

## Compatibility

- `avar/1.0` and `avar/1.1` verifiers: no impact. `x-preflight` is opaque data.
- `avar/1.2` verifiers: MAY surface preflight status alongside chain / signature verdicts.
- Forward-compat: fixtures in `@aarmos/avar-core@1.9.0` prove byte-parity — adding `x-preflight` to an existing entry yields the same `entryHash` bit-for-bit when the extension bytes are removed.
