// AVAR wire types. Mirror docs/avar/SPEC.md §3.
// Pure types only — no runtime code. Safe in browser and Node.

export type TraceStep =
  | ToolStep
  | TextStep
  | DecisionStep;

export type ToolStep = {
  kind: "tool";
  ts: number;
  tool: string;
  argsRedacted: unknown;
  outputPreview?: string;
  ok: boolean;
  ms?: number;
  error?: string;
  policyHits?: PolicyHit[];
  prevStepHash?: string;
  stepHash?: string;
};

export type TextStep = {
  kind: "text";
  ts: number;
  preview: string;
  prevStepHash?: string;
  stepHash?: string;
};

export type DecisionStep = {
  kind: "decision";
  ts: number;
  tool: string;
  /**
   * Decision label. `ALLOW | MODIFY | DENY | STEP_UP | DEFER` are the
   * classic policy decisions. Minor spec revisions add sources:
   *  - `KILL` (Wave 1.2, kill-switch)
   *  - `ROTATE | REVOKE` (Wave 1.3, vault)
   *  - `FIRST_CONTACT` (Wave 1.4, egress)
   *  - future additive values.
   * Verifiers MUST treat unknown decision strings as opaque data.
   */
  decision: string;
  source: string;
  reason?: string;
  note?: string;
  gates?: { kind: string; source: string }[];
  policyFingerprint?: string;
  policyIssuer?: string;
  bundleState?: "unknown" | "none" | "valid" | "grace" | "invalid";
  killSwitchAt?: boolean;
  /**
   * Kill-switch scope at the time of the decision (Wave 1.2, `avar/1.1`).
   * Present on `decision: "KILL"` entries produced by the kill-switch;
   * MAY appear on other decisions as advisory context. Verifiers treat
   * unknown values as opaque data.
   */
  killScope?: "all" | "writes" | "destructive";
  /** Optional per-step framework tags — see spec §8. */
  frameworks?: string[];
  prevStepHash?: string;
  stepHash?: string;
};

export type PolicyHit = {
  ruleId: string;
  action: "block" | "downgrade" | "warn" | "allow";
  reason?: string;
};

export type AvarEntry = {
  id: string;
  ts: number;
  finishedAt?: number;
  workspaceId: string;
  agentId?: string;
  agentName?: string;
  agentEmoji?: string;
  agentColor?: string;
  queryRedacted: string;
  steps: TraceStep[];
  outcome: "ok" | "error" | "aborted";
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  seed?: number | string;
  systemFingerprint?: string;
  signature?: string;
  devicePubKey?: string;
  deviceFingerprint?: string;
  policyFingerprint?: string;
  policyIssuer?: string;
  parentTraceId?: string | null;
  delegationChain?: { agentId: string; traceId?: string | null; at: number }[];
  /**
   * Cross-party receipt binding (avar/1.2, additive). Pinned when this run
   * was initiated by an inbound call from another AVAR-speaking node so an
   * auditor can walk the delegation forest across trust boundaries.
   * Verifiers MUST treat this field as opaque data and include it in
   * canonical JSON per §2.
   */
  parentReceipt?: {
    hash: string;
    issuer?: string;
    traceId?: string;
    protocol?: string;
  };
  prevHash?: string;
  entryHash?: string;
  /**
   * Reserved for multi-seat aggregation (Wave 4). Absent in `avar/1.0`.
   * When present, verifiers treat it as opaque data and include it in
   * canonical JSON per §2.
   */
  seatId?: string;
  /** Optional framework tags — see spec §8. */
  frameworks?: string[];
} & { [k: `x-${string}`]: unknown };


export type BundleManifest = {
  format: "avar/1";
  generatedAt: string;
  producer: { name: string; version: string };
  entryCount: number;
  entriesSha256: string;
  chainHead: { entryHash: string; index: number };
  devicePublicKeys: string[];
};

export type BundlePubKeys = {
  keys: Array<{
    kid: string;
    algorithm: "Ed25519";
    publicKey: string;
  }>;
};

export type AvarBundle = {
  /** Contents of `SPEC-VERSION` file — MUST equal `"avar/1"`. */
  specVersion: string;
  manifest: BundleManifest;
  /** Raw bytes of `entries.ndjson` — used to verify `entriesSha256`. */
  entriesNdjsonBytes: Uint8Array;
  entries: AvarEntry[];
  pubkeys: BundlePubKeys;
};

export type VerificationIssue = {
  index: number;
  kind:
    | "spec-version-mismatch"
    | "manifest-invalid"
    | "entries-parse-failed"
    | "entries-sha256-mismatch"
    | "fingerprint-mismatch"
    | "signature-invalid"
    | "signature-unsupported"
    | "chain-broken"
    | "partial-step-chain"
    | "step-chain-broken";
  detail?: string;
};

export type VerificationReport = {
  formatOk: boolean;
  entriesSha256Ok: boolean;
  chainOk: boolean;
  perStepChainOk: boolean;
  signaturesOk: boolean;
  fingerprintsOk: boolean;
  entryCount: number;
  signedCount: number;
  unsignedCount: number;
  unchainedCount: number;
  chainHead: { entryHash: string; index: number };
  issues: VerificationIssue[];
  verdict: "valid" | "invalid" | "valid-with-warnings";
};
