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
  /**
   * Schema-contract verdict (avar/1.3, additive). Optional per-tool
   * verdict from the contracts layer. When present, `in` covers the
   * pre-call args validation and `out` covers the post-call output
   * validation. Verifiers MUST treat unknown fields as opaque data and
   * include them in canonical JSON per §2. Absence means "no contract
   * was declared for this tool at call time" — never treat that as a
   * failure.
   */
  contract?: {
    in?: "pass" | "fail" | "absent";
    out?: "pass" | "fail" | "absent";
    /** Short human-readable rule id(s) that failed, if any. */
    violations?: string[];
    /** Contract fingerprint (SHA-256 hex prefix of canonical schema). */
    fingerprint?: string;
  };
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
   * classic policy decisions (AARM Core R4). Minor spec revisions add
   * sources:
   *  - `KILL` (kill-switch)
   *  - `ROTATE | REVOKE` (vault)
   *  - `FIRST_CONTACT` (egress)
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
   * Kill-switch scope at the time of the decision (`avar/1.1`).
   * Present on `decision: "KILL"` entries produced by the kill-switch;
   * MAY appear on other decisions as advisory context. Verifiers treat
   * unknown values as opaque data.
   */
  killScope?: "all" | "writes" | "destructive";
  /**
   * MODIFY provenance (avar/1.5 · AARM R4). Present on
   * `decision: "MODIFY"` entries. `argsBeforeHash` and `argsAfterHash`
   * are SHA-256 hex prefixes of the canonical-JSON serialization of
   * the pre- and post-transform arguments. `modifyReasons` are short
   * rule ids explaining the transform (e.g. `redact:email`,
   * `cap:max_tokens`). Verifiers MUST treat these as opaque data.
   */
  argsBeforeHash?: string;
  argsAfterHash?: string;
  modifyReasons?: string[];
  /**
   * DEFER provenance (avar/1.5 · AARM R4). Present on
   * `decision: "DEFER"` entries. `deferralId` uniquely identifies the
   * suspended action; `deferReason` is a short machine-readable code;
   * `resolutionMethods` enumerates permitted resolution paths (e.g.
   * `human`, `context-update`, `contract-update`); `timeoutMs` is the
   * scheduler timeout after which the runtime MUST emit a follow-up
   * `DENY` receipt referencing the same `deferralId`. On resolution,
   * `resolvedAt` and `resolutionMethod` are stamped on the follow-up
   * decision receipt. Verifiers MUST treat these as opaque data.
   */
  deferralId?: string;
  deferReason?: string;
  resolutionMethods?: string[];
  timeoutMs?: number;
  resolvedAt?: number;
  resolutionMethod?: string;
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
  /**
   * Producer provenance (avar/1.4, additive). Identifies the *build* that
   * emitted this receipt so a receipt leaked in the wild can be attributed
   * to a genuine Aarmos release or flagged as fork-origin. Never gates
   * chain verification — a receipt without `origin` is still a valid
   * AVAR entry. Verifiers MUST treat unknown fields as opaque data and
   * include them in canonical JSON per §2.
   */
  origin?: {
    /** Release identifier (e.g. semver of the producing build). */
    release: string;
    /** First 16 hex of the release manifest's Ed25519 signature. */
    releaseSig?: string;
    /** SHA-256 fingerprint prefix of the release-signer pubkey. */
    builderPubkey?: string;
  };
  /**
   * Declared agent intent (avar/1.5 · AARM R3). Short
   * natural-language string stated by the caller at run start describing
   * what the agent is trying to accomplish. Policy evaluation MAY reference
   * this via `ctx.intent`. `intentHash` is the SHA-256 hex prefix of the
   * canonical intent string; verifiers MUST treat both fields as opaque
   * data. Absence means "no intent was declared" and MUST NOT be treated
   * as a validation failure by existing verifiers.
   */
  intent?: string;
  intentHash?: string;
  /**
   * SPEC-ADDENDUM-1.5 — per-agent identity attestation (additive).
   * Optional. When present, `publicKey` (raw Ed25519, base64url) lets an
   * offline verifier check `agentSignature` without a side registry.
   * `fingerprint` is advisory (display only); verifier does NOT
   * recompute or gate on it.
   */
  agentIdentity?: {
    agentId: string;
    alg: "Ed25519";
    fingerprint: string;
    publicKey?: string;
  };
  /**
   * SPEC-ADDENDUM-1.5 — base64 Ed25519 signature over UTF-8 bytes of the
   * tail `stepHash` (or `GENESIS_PREV_HASH` when the entry has no chained
   * steps). Produced by the agent's active key. When both `agentSignature`
   * and `agentIdentity.publicKey` are present, verifiers MUST verify it
   * and fail hard on mismatch. When `agentSignature` is present but
   * `publicKey` is absent, verifiers emit a warning (`agent-key-unresolved`)
   * — legacy behavior for pre-B1 receipts.
   */
  agentSignature?: string;
  /**
   * SPEC-ADDENDUM-1.9 — governance chain (additive, OPTIONAL).
   * Names the authority (SPEC-1.8) and manifest sequence (SPEC-1.7)
   * under which this run was governed, plus the policy-bundle digest
   * the receipt's decisions were produced under. Verifiers with a
   * matching authority manifest can independently confirm "governed by
   * X at seq N" offline (rule G3 — no fetching). Absent → no behavior
   * change from pre-1.9 (rule G1).
   */
  governance?: {
    authorityId: string;      // `aarmos://authority/<slug>` per SPEC-1.8 R1
    manifestSequence: number; // monotonic per SPEC-1.7
    policyDigest: string;     // sha256:<hex> of the governing bundle
    policyLabel?: string;     // OPTIONAL human aid (e.g. "starter/v1.4")
    /**
     * SPEC-1.9 forward-compat slot for a future immutable evidence
     * object (approvals, waivers, exceptions). Verifiers in 1.9 MUST
     * ignore this field — its shape is reserved for a 2.x addendum.
     */
    evidenceRef?: string;
  };

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
    | "step-chain-broken"
    | "agent-signature-invalid"
    | "agent-key-unresolved"
    // SPEC-ADDENDUM-1.9 — governance-chain verdicts. Only emitted when the
    // caller supplies at least one authority manifest to `verifyGovernance`.
    | "governance-authority-mismatch"
    | "governance-sequence-stale"
    | "governance-policy-unlisted"
    | "governance-unverified";
  detail?: string;
};


export type VerificationReport = {
  formatOk: boolean;
  entriesSha256Ok: boolean;
  chainOk: boolean;
  perStepChainOk: boolean;
  signaturesOk: boolean;
  fingerprintsOk: boolean;
  /** SPEC-ADDENDUM-1.5 B1: agent-signature verification verdict. True when
   *  every entry carrying both `agentSignature` and `agentIdentity.publicKey`
   *  verified; false on any mismatch. `agentSignaturesChecked` counts the
   *  entries that were actually cryptographically verified (excludes
   *  unresolved/legacy). */
  agentSignaturesOk: boolean;
  agentSignaturesChecked: number;
  agentSignaturesUnresolved: number;
  entryCount: number;
  signedCount: number;
  unsignedCount: number;
  unchainedCount: number;
  chainHead: { entryHash: string; index: number };
  issues: VerificationIssue[];
  verdict: "valid" | "invalid" | "valid-with-warnings";
};
