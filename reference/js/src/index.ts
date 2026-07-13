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
  replayBundle,
  extractDecisionSurface,
  type ChainReplayReport,
  type ReplayMismatch,
} from "./replay";
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
// Bundle types + schema id are browser-safe. As of P2A.3 the verifier
// (`./bundle`) is also browser-safe (WebCrypto only). `./bundle-node`
// remains Node-only for the file-path convenience wrapper.
export { BUNDLE_SCHEMA_ID, type BundleReport, type BundleVerdict } from "./bundle-types";
export {
  verifyBundleBytes,
  renderBundleReportHtml,
  looksLikeAarmosBundle,
} from "./bundle";
export {
  verifyInclusionProof,
  rfc6962LeafHash,
  hexToBytes,
  bytesToHex,
  base64ToBytes,
  type InclusionProofInput,
  type InclusionProofResult,
} from "./rekor-verify";
export {
  fetchRekorCheckpoint,
  fetchConsistencyProof,
  verifyConsistencyProof,
  checkAnchorAgainstLog,
  type RekorCheckpoint,
  type ConsistencyProofResult,
  type AnchorLogCheck,
  type CheckAnchorAgainstLogInput,
} from "./checkpoint";
export {
  REKOR_PUBLIC_KEY_PEM,
  parseSignedNote,
  verifyRekorCheckpointSignature,
  derEcdsaSigToRaw,
  type ParsedSignedNote,
  type STHSignatureResult,
} from "./rekor-sth";
// Phase 2D — Scoped Tool Invites (crypto + policy checks only; structural
// validation lives in @aarmos/invite-schema).
export {
  signInvite,
  signInviteBody,
  verifyInvite,
  inviteBodyOf,
  inviteBodyDigest,
  type InviteShape,
  type InviteBodyShape,
  type InviteSigner,
  type InviteVerifyOptions,
  type InviteVerifyResult,
  type InviteRejectReason,
  type TrustedIssuerKey,
} from "./invite";


