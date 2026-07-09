// @aarmos/avar-core — Reference implementation of the AVAR spec.
// See docs/avar/SPEC.md and packages/avar-core/README.md.

export * from "./types";
export { canonicalize, utf8 } from "./canonicalize";
export {
  sha256Hex,
  computeEntryHash,
  computeStepHash,
  GENESIS_PREV_HASH,
  GENESIS_PREV_STEP_HASH,
} from "./hash";
export {
  verifySignature,
  computeDeviceFingerprint,
  signedBodyOf,
} from "./signature";
export { verifyBundle } from "./verify";
export {
  type AarmosError,
  type AarmosErrorCode,
  AARMOS_ERROR_TEMPLATES,
  aarmosError,
  formatAarmosErrorLine,
  classifyReport,
  AarmosErrorException,
} from "./errors";
export {
  diffCanonical,
  diffReceipts,
  diffPolicies,
  diffToolManifests,
  type DiffOp,
  type CanonicalDiff,
  type ReceiptDiff,
  type ReceiptEntryChange,
} from "./diff";
