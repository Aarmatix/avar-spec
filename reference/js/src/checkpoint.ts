// Rekor checkpoint (Signed Tree Head) fetch + consistency-proof verification.
//
// Phase 2A slice: closes the P1.e trust gap where `avar verify` walked the
// inclusion proof to the anchor's *recorded* rootHash but never proved that
// rootHash is a real prefix of Rekor's current signed tree.
//
// This module adds:
//   1. fetchRekorCheckpoint()  — GET /api/v1/log            (current STH)
//   2. fetchConsistencyProof() — GET /api/v1/log/proof      (RFC 6962 §2.1.2)
//   3. verifyConsistencyProof() — pure, WebCrypto, browser + Node safe
//   4. checkAnchorAgainstLog()  — glue for `avar verify --check-log`
//
// Non-goals for this module (out of scope here, may be addressed in future spec revisions):
//   - Verifying the STH signature against Rekor's public key (needs ECDSA
//     P-256 + Sigstore signed-note parser; landing in the browser verifier
//     slice). We surface `checkpointSignatureVerified: false` with a clear
//     reason so honest output beats a fake ✓.

import {
  hexToBytes,
  bytesToHex,
} from "./rekor-verify.ts";
import {
  verifyRekorCheckpointSignature,
  type STHSignatureResult,
} from "./rekor-sth.ts";




export interface RekorCheckpoint {
  rekorUrl: string;
  treeID: string;
  treeSize: number;
  rootHash: string; // 64 hex
  signedTreeHead: string; // raw note (base64 or PEM-ish; opaque here)
}

export interface ConsistencyProofResult {
  valid: boolean;
  computedRootHex: string;
  reason?: string;
}

export interface AnchorLogCheck {
  ok: boolean;
  rekorUrl: string;
  anchor: { treeSize: number; rootHash: string };
  checkpoint?: { treeSize: number; rootHash: string; treeID: string };
  consistencyProof?: {
    valid: boolean;
    hashCount: number;
    computedRootHex?: string;
    reason?: string;
  };
  /** STH signature verification result. When `pubkeyPem` is provided
   * (or defaulted for rekor.sigstore.dev), this proves the STH we
   * just verified against is actually signed by the log. */
  checkpointSignatureVerified: boolean;
  checkpointSignatureReason: string;
  checkpointSignatureDetail?: STHSignatureResult;
  issues: Array<{ kind: string; detail: string }>;
}


// ---------- HTTP ----------

export async function fetchRekorCheckpoint(
  rekorUrl: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<RekorCheckpoint> {
  const url = trimSlash(rekorUrl) + "/api/v1/log";
  const body = await getJson(url, opts);
  const treeSize = numField(body, ["treeSize", "TreeSize"]);
  const rootHash = strField(body, ["rootHash", "RootHash"]);
  const treeID = strField(body, ["treeID", "TreeID", "treeId"]) ?? "";
  const signedTreeHead = strField(body, ["signedTreeHead", "SignedTreeHead"]) ?? "";
  if (treeSize == null || rootHash == null) {
    throw new Error(`Rekor /api/v1/log missing treeSize/rootHash (got: ${JSON.stringify(body).slice(0, 200)})`);
  }
  if (!/^[0-9a-f]{64}$/.test(rootHash)) {
    throw new Error(`Rekor rootHash not 64 hex: ${rootHash.slice(0, 16)}…`);
  }
  return { rekorUrl, treeID, treeSize, rootHash, signedTreeHead };
}

export async function fetchConsistencyProof(
  rekorUrl: string,
  firstSize: number,
  lastSize: number,
  opts: { timeoutMs?: number; treeID?: string; fetchImpl?: typeof fetch } = {},
): Promise<string[]> {
  if (firstSize <= 0) throw new Error("firstSize must be > 0");
  if (lastSize < firstSize) throw new Error("lastSize must be >= firstSize");
  if (lastSize === firstSize) return []; // trivially consistent
  const params = new URLSearchParams({
    firstSize: String(firstSize),
    lastSize: String(lastSize),
  });
  if (opts.treeID) params.set("treeID", opts.treeID);
  const url = trimSlash(rekorUrl) + "/api/v1/log/proof?" + params.toString();
  const body = await getJson(url, opts);
  const hashes = (body as { hashes?: unknown }).hashes;
  if (!Array.isArray(hashes)) throw new Error("Rekor consistency proof missing 'hashes' array");
  const out: string[] = [];
  for (const h of hashes) {
    if (typeof h !== "string" || !/^[0-9a-f]{64}$/.test(h)) {
      throw new Error("Rekor consistency proof hash not 64 hex");
    }
    out.push(h);
  }
  return out;
}

// ---------- RFC 6962 §2.1.2 consistency proof ----------

/**
 * Verify a Merkle consistency proof between an old tree (size=first, root=oldRoot)
 * and a new tree (size=second, root=newRoot). Pure, WebCrypto-based.
 *
 * Algorithm follows RFC 6962 §2.1.2 verbatim.
 */
export async function verifyConsistencyProof(input: {
  first: number;
  second: number;
  oldRootHex: string;
  newRootHex: string;
  proofHex: string[];
}): Promise<ConsistencyProofResult> {
  const { first, second, oldRootHex, newRootHex, proofHex } = input;
  if (first <= 0) return fail("first must be > 0");
  if (second < first) return fail("second must be >= first");
  if (!/^[0-9a-f]{64}$/.test(oldRootHex)) return fail("oldRoot not 64 hex");
  if (!/^[0-9a-f]{64}$/.test(newRootHex)) return fail("newRoot not 64 hex");
  for (const h of proofHex) if (!/^[0-9a-f]{64}$/.test(h)) return fail("proof hash not 64 hex");

  if (first === second) {
    if (proofHex.length !== 0) return fail("expected empty proof when first == second");
    if (oldRootHex !== newRootHex) return fail("first == second but roots differ");
    return { valid: true, computedRootHex: newRootHex };
  }

  // RFC 6962: if `first` is an exact power of two AND first === (leftmost
  // subtree of `second`), the old root itself is the first proof node. In
  // that case Rekor omits it; prepend before running the walk.
  let proof = proofHex.slice();
  if ((first & (first - 1)) === 0) proof = [oldRootHex, ...proof];

  let fn = first - 1;
  let sn = second - 1;
  while ((fn & 1) === 1) {
    fn >>>= 1;
    sn >>>= 1;
  }

  if (proof.length === 0) return fail("empty consistency proof");
  let fr = hexToBytes(proof[0]!);
  let sr = hexToBytes(proof[0]!);
  let i = 1;

  while (fn !== 0) {
    if (i >= proof.length) return fail("consistency proof too short");
    const c = hexToBytes(proof[i]!);
    if ((fn & 1) === 1 || fn === sn) {
      fr = await nodeHash(c, fr);
      sr = await nodeHash(c, sr);
      while ((fn & 1) === 0 && fn !== 0) {
        fn >>>= 1;
        sn >>>= 1;
      }
    } else {
      sr = await nodeHash(sr, c);
    }
    fn >>>= 1;
    sn >>>= 1;
    i++;
  }

  while (sn !== 0) {
    if (i >= proof.length) return fail("consistency proof too short (right spine)");
    const c = hexToBytes(proof[i]!);
    sr = await nodeHash(sr, c);
    sn >>>= 1;
    i++;
  }

  if (i !== proof.length) return fail(`consistency proof too long: ${proof.length - i} unused element(s)`);
  const frHex = bytesToHex(fr);
  const srHex = bytesToHex(sr);
  if (frHex !== oldRootHex) return { valid: false, computedRootHex: srHex, reason: `computed old root ${frHex} != declared ${oldRootHex}` };
  if (srHex !== newRootHex) return { valid: false, computedRootHex: srHex, reason: `computed new root ${srHex} != declared ${newRootHex}` };
  return { valid: true, computedRootHex: srHex };
}

// ---------- Glue: verify an anchor against the live log ----------

export interface CheckAnchorAgainstLogInput {
  rekorUrl: string;
  anchor: { treeSize: number; rootHash: string };
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** SPKI PEM for the Rekor log's public key. When omitted, defaults to the
   * pinned production `rekor.sigstore.dev` key from `./rekor-sth.ts`. Pass
   * a mirror's key when `rekorUrl` points at a mirror or private instance. */
  pubkeyPem?: string;
  /** Skip STH signature verification entirely (structural check only).
   * Use only for offline test fixtures — production callers should verify. */
  skipSignature?: boolean;
}

export async function checkAnchorAgainstLog(
  input: CheckAnchorAgainstLogInput,
): Promise<AnchorLogCheck> {
  const issues: AnchorLogCheck["issues"] = [];
  const result: AnchorLogCheck = {
    ok: false,
    rekorUrl: input.rekorUrl,
    anchor: { treeSize: input.anchor.treeSize, rootHash: input.anchor.rootHash },
    checkpointSignatureVerified: false,
    checkpointSignatureReason: input.skipSignature
      ? "STH signature verification skipped by caller (structural check only)"
      : "STH signature not yet verified",
    issues,
  };

  let checkpoint: RekorCheckpoint;
  try {
    checkpoint = await fetchRekorCheckpoint(input.rekorUrl, {
      timeoutMs: input.timeoutMs,
      fetchImpl: input.fetchImpl,
    });
  } catch (err) {
    issues.push({ kind: "checkpoint-fetch-failed", detail: (err as Error).message });
    return result;
  }
  result.checkpoint = {
    treeSize: checkpoint.treeSize,
    rootHash: checkpoint.rootHash,
    treeID: checkpoint.treeID,
  };

  // Verify STH signature first — if the checkpoint isn't signed by the log,
  // nothing else below is meaningful.
  if (!input.skipSignature) {
    const sth = await verifyRekorCheckpointSignature(checkpoint, {
      pubkeyPem: input.pubkeyPem,
    });
    result.checkpointSignatureDetail = sth;
    result.checkpointSignatureVerified = sth.ok;
    result.checkpointSignatureReason = sth.ok
      ? `STH signed by ${sth.keyName ?? "log"} (${sth.origin ?? "?"}) — ECDSA P-256 / SHA-256`
      : `STH signature INVALID: ${sth.reason ?? "unknown"}`;
    if (!sth.ok) {
      issues.push({
        kind: "sth-signature-invalid",
        detail: sth.reason ?? "STH signature did not verify against pinned pubkey",
      });
      return result;
    }
  }

  if (input.anchor.treeSize > checkpoint.treeSize) {
    issues.push({
      kind: "anchor-ahead-of-log",
      detail: `anchor tree size ${input.anchor.treeSize} > current log size ${checkpoint.treeSize}`,
    });
    return result;
  }

  if (input.anchor.treeSize === checkpoint.treeSize) {
    if (input.anchor.rootHash !== checkpoint.rootHash) {
      issues.push({
        kind: "anchor-root-diverges",
        detail: `anchor rootHash ${input.anchor.rootHash} != current log rootHash ${checkpoint.rootHash} at same tree size ${checkpoint.treeSize}`,
      });
      return result;
    }
    result.consistencyProof = { valid: true, hashCount: 0, computedRootHex: checkpoint.rootHash };
    result.ok = true;
    return result;
  }

  let proof: string[];
  try {
    proof = await fetchConsistencyProof(
      input.rekorUrl,
      input.anchor.treeSize,
      checkpoint.treeSize,
      { timeoutMs: input.timeoutMs, treeID: checkpoint.treeID, fetchImpl: input.fetchImpl },
    );
  } catch (err) {
    issues.push({ kind: "consistency-proof-fetch-failed", detail: (err as Error).message });
    return result;
  }

  const cp = await verifyConsistencyProof({
    first: input.anchor.treeSize,
    second: checkpoint.treeSize,
    oldRootHex: input.anchor.rootHash,
    newRootHex: checkpoint.rootHash,
    proofHex: proof,
  });
  result.consistencyProof = {
    valid: cp.valid,
    hashCount: proof.length,
    computedRootHex: cp.computedRootHex || undefined,
    reason: cp.reason,
  };
  if (!cp.valid) {
    issues.push({ kind: "consistency-proof-invalid", detail: cp.reason ?? "consistency proof did not verify" });
    return result;
  }

  result.ok = true;
  return result;
}


// ---------- helpers ----------

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest("SHA-256", bytes as BufferSource);
    return new Uint8Array(buf);
  }
  const { createHash } = await import("node:crypto");
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

async function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(1 + left.length + right.length);
  input[0] = 0x01;
  input.set(left, 1);
  input.set(right, 1 + left.length);
  return sha256(input);
}

async function getJson(url: string, opts: { timeoutMs?: number; fetchImpl?: typeof fetch }): Promise<Record<string, unknown>> {
  const f = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    const resp = await f(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!resp.ok) {
      let extra = "";
      try { extra = " — " + (await resp.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`GET ${url} → ${resp.status} ${resp.statusText}${extra}`);
    }
    return (await resp.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(to);
  }
}

function strField(o: unknown, keys: string[]): string | null {
  const rec = o as Record<string, unknown> | null;
  if (!rec) return null;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string") return v;
  }
  return null;
}

function numField(o: unknown, keys: string[]): number | null {
  const rec = o as Record<string, unknown> | null;
  if (!rec) return null;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function trimSlash(u: string): string {
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

function fail(reason: string): ConsistencyProofResult {
  return { valid: false, computedRootHex: "", reason };
}
