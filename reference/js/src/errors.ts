// Shared AarmosError taxonomy — used by @aarmos/avar-core consumers
// (CLI, bridge, PWA verifier) so a stable `code`/`message`/`hint`/`docsUrl`
// shape appears everywhere. Pure data + a small helper; no runtime deps.

export type AarmosErrorCode =
  // Bundle parsing (surface-agnostic; the CLI also raises these)
  | "BUNDLE_OVERSIZED"
  | "BUNDLE_NOT_ZIP"
  | "BUNDLE_MISSING_FILES"
  | "BUNDLE_INVALID_JSON"
  | "BUNDLE_INVALID_NDJSON"
  | "BUNDLE_SPEC_UNSUPPORTED"
  | "BUNDLE_EMPTY"
  // Report-level verdicts (bundle parsed, but verification failed)
  | "SPEC_VERSION_MISMATCH"
  | "ENTRIES_SHA256_MISMATCH"
  | "SIGNATURE_MISMATCH"
  | "FINGERPRINT_MISMATCH"
  | "CHAIN_BROKEN"
  | "STEP_CHAIN_BROKEN"
  | "AGENT_SIGNATURE_INVALID"
  | "MANIFEST_INVALID"
  // File I/O (CLI/bridge only)
  | "FILE_NOT_FOUND"
  | "FILE_UNREADABLE"
  // Generic
  | "UNKNOWN";

export interface AarmosError {
  code: AarmosErrorCode;
  message: string;
  hint: string;
  docsUrl: string;
}

const SPEC_URL = "https://aarmos.io/docs/avar-spec";
const VERIFY_URL = "https://aarmos.io/trust/verify";
const QUICKSTART_URL = "https://aarmos.io/docs/quickstart";

export const AARMOS_ERROR_TEMPLATES: Record<AarmosErrorCode, Omit<AarmosError, "code">> = {
  BUNDLE_OVERSIZED: {
    message: "That bundle is larger than the 25 MB browser limit.",
    hint: "Run `aarmos verify <bundle>` locally instead — the CLI has no size cap.",
    docsUrl: QUICKSTART_URL,
  },
  BUNDLE_NOT_ZIP: {
    message: "That file is not a valid .avar.zip.",
    hint: "Bundles are zip archives. Rename or re-export the file, then try again.",
    docsUrl: SPEC_URL,
  },
  BUNDLE_MISSING_FILES: {
    message: "Bundle is missing one or more required files.",
    hint: "A valid AVAR bundle contains SPEC-VERSION, manifest.json, entries.ndjson, and pubkeys.json.",
    docsUrl: SPEC_URL,
  },
  BUNDLE_INVALID_JSON: {
    message: "manifest.json or pubkeys.json is not valid JSON.",
    hint: "The file exists but cannot be parsed. Re-export from the CLI to regenerate a clean bundle.",
    docsUrl: SPEC_URL,
  },
  BUNDLE_INVALID_NDJSON: {
    message: "entries.ndjson contains a malformed line.",
    hint: "Each line must be a self-contained JSON entry. One corrupt line usually means the file was edited by hand.",
    docsUrl: SPEC_URL,
  },
  BUNDLE_SPEC_UNSUPPORTED: {
    message: "This bundle was produced by a spec version this verifier does not support.",
    hint: "Update to the latest verifier (`npm i -g @aarmos/avar-core`) or re-export with a matching spec version.",
    docsUrl: SPEC_URL,
  },
  BUNDLE_EMPTY: {
    message: "Bundle contains no entries.",
    hint: "An empty ledger is unusual — check that the run actually produced receipts before exporting.",
    docsUrl: SPEC_URL,
  },
  SPEC_VERSION_MISMATCH: {
    message: "This bundle uses a spec version this verifier does not recognize.",
    hint: "Update the verifier (`npm i -g @aarmos/avar-core`) or re-export the bundle with matching spec version.",
    docsUrl: SPEC_URL,
  },
  ENTRIES_SHA256_MISMATCH: {
    message: "entries.ndjson has been modified since the bundle was signed.",
    hint: "The envelope hash in manifest.json no longer matches the file. Do not trust this bundle — re-export from the CLI.",
    docsUrl: VERIFY_URL,
  },
  SIGNATURE_MISMATCH: {
    message: "One or more entry signatures do not match the embedded public keys.",
    hint: "The bundle was modified after signing, or the wrong pubkeys.json is bundled.",
    docsUrl: VERIFY_URL,
  },
  FINGERPRINT_MISMATCH: {
    message: "Device fingerprint on one or more entries does not match its public key.",
    hint: "The entry claims a device whose public key does not hash to the declared fingerprint. Treat this bundle as untrusted.",
    docsUrl: VERIFY_URL,
  },
  CHAIN_BROKEN: {
    message: "The per-entry hash chain is broken.",
    hint: "An entry was inserted, removed, or edited after signing. The break index is shown in the issues list.",
    docsUrl: VERIFY_URL,
  },
  STEP_CHAIN_BROKEN: {
    message: "The per-step hash chain inside one or more entries is broken.",
    hint: "A decision or tool step was tampered with. The affected entry index is in the issues list.",
    docsUrl: VERIFY_URL,
  },
  AGENT_SIGNATURE_INVALID: {
    message: "One or more entries carry an agentSignature that does not verify against the declared agent public key.",
    hint: "The receipt claims a specific agent produced it, but the signature over the tail step hash is wrong. Treat as untrusted. See `aarmos identity` for rotation / recovery.",
    docsUrl: VERIFY_URL,
  },
  MANIFEST_INVALID: {
    message: "manifest.json is missing required fields or uses an unsupported format.",
    hint: "Re-export the bundle from the CLI — do not edit manifest.json by hand.",
    docsUrl: SPEC_URL,
  },
  FILE_NOT_FOUND: {
    message: "Receipt not found at the given path.",
    hint: "Check the path — a common cause is running from a different working directory than expected.",
    docsUrl: QUICKSTART_URL,
  },
  FILE_UNREADABLE: {
    message: "Receipt exists but could not be read.",
    hint: "Check filesystem permissions on the file.",
    docsUrl: QUICKSTART_URL,
  },
  UNKNOWN: {
    message: "Something went wrong while verifying that bundle.",
    hint: "Try again with a fresh export. If the error persists, run `aarmos verify` locally to see the raw error.",
    docsUrl: QUICKSTART_URL,
  },
};

export function aarmosError(
  code: AarmosErrorCode,
  overrides: Partial<Omit<AarmosError, "code">> = {},
): AarmosError {
  const base = AARMOS_ERROR_TEMPLATES[code];
  return {
    code,
    message: overrides.message ?? base.message,
    hint: overrides.hint ?? base.hint,
    docsUrl: overrides.docsUrl ?? base.docsUrl,
  };
}

/** One-line human-readable format used by the CLI on stderr / bridge diagnostics. */
export function formatAarmosErrorLine(err: AarmosError): string {
  return `✗ ${err.code}: ${err.message}\n  Next: ${err.hint}\n  Docs: ${err.docsUrl}`;
}

/**
 * Report-level classifier. Given an invalid VerificationReport, return the
 * single most-important AarmosError to surface. Priority reflects severity:
 * envelope > signature > fingerprint > chain > step-chain > format.
 */
export function classifyReport(report: {
  formatOk: boolean;
  entriesSha256Ok: boolean;
  signaturesOk: boolean;
  fingerprintsOk: boolean;
  chainOk: boolean;
  perStepChainOk: boolean;
  agentSignaturesOk?: boolean;
  verdict: "valid" | "invalid" | "valid-with-warnings";
  issues: { kind: string; detail?: string }[];
}): AarmosError | null {
  if (report.verdict !== "invalid") return null;
  if (!report.entriesSha256Ok) return aarmosError("ENTRIES_SHA256_MISMATCH");
  if (!report.signaturesOk) return aarmosError("SIGNATURE_MISMATCH");
  if (!report.fingerprintsOk) return aarmosError("FINGERPRINT_MISMATCH");
  if (!report.chainOk) return aarmosError("CHAIN_BROKEN");
  if (!report.perStepChainOk) return aarmosError("STEP_CHAIN_BROKEN");
  if (report.agentSignaturesOk === false) return aarmosError("AGENT_SIGNATURE_INVALID");
  if (!report.formatOk) {
    const specIssue = report.issues.find((i) => i.kind === "spec-version-mismatch");
    if (specIssue) {
      return aarmosError("SPEC_VERSION_MISMATCH", {
        message: specIssue.detail ? `Spec mismatch — ${specIssue.detail}` : undefined,
      });
    }
    return aarmosError("MANIFEST_INVALID");
  }
  return aarmosError("UNKNOWN");
}

/**
 * Optional Error subclass so throw/catch sites can propagate an AarmosError
 * through code that expects `Error`. Consumers can detect via
 * `err instanceof AarmosErrorException` or `err && (err as any).aarmos`.
 */
export class AarmosErrorException extends Error {
  readonly aarmos: AarmosError;
  constructor(err: AarmosError) {
    super(`${err.code}: ${err.message}`);
    this.name = "AarmosErrorException";
    this.aarmos = err;
  }
}
