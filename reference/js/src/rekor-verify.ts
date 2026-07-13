// RFC 6962 inclusion-proof verification (structural).
//
// Pure — no node:crypto. Uses WebCrypto (subtle.digest) so this module runs in
// the browser too. See §2A deepening for the checkpoint / consistency-proof
// step; this file is only the "leafHash walks up to the anchor's rootHash"
// half of the proof, which is all P1.e commits to.

/** Compute the RFC 6962 leaf hash: SHA-256(0x00 || leafBytes). */
export async function rfc6962LeafHash(leaf: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(1 + leaf.length);
  input[0] = 0x00;
  input.set(leaf, 1);
  return sha256(input);
}

/** SHA-256(0x01 || left || right). */
async function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(1 + left.length + right.length);
  input[0] = 0x01;
  input.set(left, 1);
  input.set(right, 1 + left.length);
  return sha256(input);
}

export interface InclusionProofInput {
  leafHashHex: string;      // 64 hex chars
  leafIndex: number;        // 0-based position within tree of size `treeSize`
  treeSize: number;         // > 0
  proofHashesHex: string[]; // sibling hashes, root-ward last
  rootHashHex: string;      // expected Merkle root
}

export interface InclusionProofResult {
  valid: boolean;
  computedRootHex: string;
  reason?: string;
}

/**
 * Verify a Merkle inclusion proof per RFC 6962 §2.1.1.
 * Returns { valid, computedRoot } — the caller decides how to surface it.
 */
export async function verifyInclusionProof(p: InclusionProofInput): Promise<InclusionProofResult> {
  if (p.treeSize <= 0) return fail("treeSize must be > 0");
  if (p.leafIndex < 0 || p.leafIndex >= p.treeSize)
    return fail(`leafIndex ${p.leafIndex} out of range for treeSize ${p.treeSize}`);
  if (!/^[0-9a-f]{64}$/.test(p.leafHashHex)) return fail("leafHash must be 64 hex chars");
  if (!/^[0-9a-f]{64}$/.test(p.rootHashHex)) return fail("rootHash must be 64 hex chars");
  for (const h of p.proofHashesHex) {
    if (!/^[0-9a-f]{64}$/.test(h)) return fail("proof hash must be 64 hex chars");
  }

  let fn = p.leafIndex;
  let sn = p.treeSize - 1;
  let r = hexToBytes(p.leafHashHex);
  let i = 0;

  while (sn > 0) {
    if (i >= p.proofHashesHex.length) return fail("proof too short");
    const sibling = hexToBytes(p.proofHashesHex[i]!);
    if (fn % 2 === 1 || fn === sn) {
      r = await nodeHash(sibling, r);
      while (fn % 2 === 0 && fn !== 0) {
        fn = fn >>> 1;
        sn = sn >>> 1;
      }
    } else {
      r = await nodeHash(r, sibling);
    }
    fn = fn >>> 1;
    sn = sn >>> 1;
    i++;
  }

  if (i !== p.proofHashesHex.length) {
    return fail(`proof too long: ${p.proofHashesHex.length - i} unused element(s)`);
  }
  const computedRootHex = bytesToHex(r);
  return computedRootHex === p.rootHashHex
    ? { valid: true, computedRootHex }
    : { valid: false, computedRootHex, reason: `computed root ${computedRootHex} != declared ${p.rootHashHex}` };
}

// ----- helpers -----

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const g: unknown = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto;
  const subtle = (g as { subtle?: SubtleCrypto } | undefined)?.subtle;
  if (subtle) {
    const buf = await subtle.digest("SHA-256", bytes as BufferSource);
    return new Uint8Array(buf);
  }
  // Node fallback (rare path — the verifier already ships node:crypto elsewhere).
  const { createHash } = await import("node:crypto");
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function base64ToBytes(b64: string): Uint8Array {
  const g: unknown = globalThis;
  const buf = (g as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (buf) return new Uint8Array(buf.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fail(reason: string): InclusionProofResult {
  return { valid: false, computedRootHex: "", reason };
}
