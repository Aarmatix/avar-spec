// Rekor Signed Tree Head (STH) signature verification.
//
// Phase 2A.2: closes the last honesty gap in `avar verify --check-log`.
// Until this module landed we walked a real consistency proof against
// Rekor's current STH, but we never proved the STH itself was actually
// signed by Rekor — so a MITM'd Rekor endpoint could serve a coherent
// fake tree.
//
// Format: Sigstore signed-note (a.k.a. x/mod/sumdb/note).
//   line 1: origin (e.g. "rekor.sigstore.dev - <treeID>")
//   line 2: tree size (decimal)
//   line 3: base64 root hash
//   line 4: (blank separator)
//   line 5+: "— <keyname> <base64(keyHash4 || sig)>"
//
// Signed bytes = the three body lines including their trailing \n
// (i.e. everything before "\n— "). Signature is ECDSA over SHA-256
// of that body, encoded as ASN.1 DER — WebCrypto wants raw r||s, so
// we do a small DER decoder here.
//
// Pure. Browser + Node safe (uses WebCrypto SubtleCrypto only).

import { base64ToBytes } from "./rekor-verify.ts";
import type { RekorCheckpoint } from "./checkpoint.ts";

/**
 * Public key of the production Rekor log. ECDSA P-256, SHA-256.
 * Fetched 2026-07-13 from https://rekor.sigstore.dev/api/v1/log/publicKey.
 * Verified match against the value pinned in the sigstore/root-signing repo.
 * Override with `verifyRekorCheckpointSignature(..., { pubkeyPem })` if you
 * point `AARMOS_REKOR_URL` at a mirror or private instance.
 */
export const REKOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE2G2Y+2tabdTV5BcGiBIx0a9fAFwr
kBbmLSGtks4L3qX6yYY0zufBnhC8Ur/iy55GhWP/9A/bY2LhC30M9+RYtw==
-----END PUBLIC KEY-----`;

export interface ParsedSignedNote {
  origin: string;
  treeSize: number;
  rootHashB64: string;
  bodyBytes: Uint8Array; // exact bytes covered by the signature
  signatures: Array<{ keyName: string; keyHash: Uint8Array; sigDer: Uint8Array }>;
}

export interface STHSignatureResult {
  ok: boolean;
  reason?: string;
  origin?: string;
  keyName?: string;
  matched?: {
    treeSize: boolean;
    rootHash: boolean;
  };
}

/** Parse a Sigstore signed-note. Throws on structural failure. */
export function parseSignedNote(note: string): ParsedSignedNote {
  // Find the "\n\n" separator between body and signature block.
  const sep = note.indexOf("\n\n");
  if (sep < 0) throw new Error("signed note: missing blank-line separator");
  const bodyStr = note.slice(0, sep + 1); // include the third-line \n; exclude the blank
  const sigBlock = note.slice(sep + 2);

  const bodyLines = bodyStr.split("\n");
  // bodyLines ends with "" because bodyStr ends in "\n"
  if (bodyLines.length < 4) throw new Error("signed note: body must have >= 3 lines");
  const origin = bodyLines[0]!;
  const treeSize = Number(bodyLines[1]);
  const rootHashB64 = bodyLines[2]!;
  if (!Number.isFinite(treeSize) || treeSize < 0) throw new Error("signed note: bad tree size");
  if (!/^[A-Za-z0-9+/=]+$/.test(rootHashB64)) throw new Error("signed note: bad root hash b64");

  const signatures: ParsedSignedNote["signatures"] = [];
  for (const rawLine of sigBlock.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // Signature line: "— <name> <b64>"  (em-dash U+2014, but also accept plain "-")
    let rest: string;
    if (line.startsWith("\u2014 ")) rest = line.slice(2);
    else if (line.startsWith("- ")) rest = line.slice(2);
    else continue;
    const sp = rest.indexOf(" ");
    if (sp < 0) continue;
    const keyName = rest.slice(0, sp);
    const b64 = rest.slice(sp + 1);
    let raw: Uint8Array;
    try { raw = base64ToBytes(b64); } catch { continue; }
    if (raw.length < 5) continue;
    const keyHash = raw.slice(0, 4);
    const sigDer = raw.slice(4);
    signatures.push({ keyName, keyHash, sigDer });
  }
  if (signatures.length === 0) throw new Error("signed note: no signatures found");

  return {
    origin,
    treeSize,
    rootHashB64,
    bodyBytes: new TextEncoder().encode(bodyStr),
    signatures,
  };
}

/**
 * Verify the STH signature on a Rekor checkpoint against a P-256 SPKI PEM key.
 * Also asserts the parsed note agrees with the checkpoint's treeSize/rootHash.
 */
export async function verifyRekorCheckpointSignature(
  checkpoint: RekorCheckpoint,
  opts: { pubkeyPem?: string } = {},
): Promise<STHSignatureResult> {
  const note = checkpoint.signedTreeHead;
  if (!note || typeof note !== "string") {
    return { ok: false, reason: "checkpoint has no signedTreeHead" };
  }

  let parsed: ParsedSignedNote;
  try { parsed = parseSignedNote(note); }
  catch (err) { return { ok: false, reason: `parse: ${(err as Error).message}` }; }

  // Cross-check: the note's declared root/size must match the JSON checkpoint.
  const treeSizeMatch = parsed.treeSize === checkpoint.treeSize;
  const noteRootHex = bytesToHexLower(base64ToBytes(parsed.rootHashB64));
  const rootHashMatch = noteRootHex === checkpoint.rootHash.toLowerCase();
  if (!treeSizeMatch || !rootHashMatch) {
    return {
      ok: false,
      origin: parsed.origin,
      reason: `note/JSON mismatch (treeSize=${treeSizeMatch} rootHash=${rootHashMatch})`,
      matched: { treeSize: treeSizeMatch, rootHash: rootHashMatch },
    };
  }

  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return { ok: false, reason: "WebCrypto SubtleCrypto not available" };

  const spki = pemToDer(opts.pubkeyPem ?? REKOR_PUBLIC_KEY_PEM);
  let key: CryptoKey;
  try {
    key = await subtle.importKey(
      "spki",
      spki as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch (err) { return { ok: false, reason: `importKey: ${(err as Error).message}` }; }

  // Try each signature line; accept the first that verifies. Rekor typically
  // ships one, but the format allows N.
  for (const sig of parsed.signatures) {
    let raw: Uint8Array;
    try { raw = derEcdsaSigToRaw(sig.sigDer, 32); }
    catch { continue; }
    let ok = false;
    try {
      ok = await subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        raw as BufferSource,
        parsed.bodyBytes as BufferSource,
      );
    } catch { ok = false; }
    if (ok) {
      return {
        ok: true,
        origin: parsed.origin,
        keyName: sig.keyName,
        matched: { treeSize: true, rootHash: true },
      };
    }
  }

  return {
    ok: false,
    origin: parsed.origin,
    reason: "no signature line verified against the supplied public key",
    matched: { treeSize: true, rootHash: true },
  };
}

// ---------- helpers ----------

function pemToDer(pem: string): Uint8Array {
  const m = pem.match(/-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/);
  if (!m) throw new Error("bad PEM");
  return base64ToBytes(m[1]!.replace(/\s+/g, ""));
}

function bytesToHexLower(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Decode an ASN.1 DER ECDSA signature (SEQUENCE { INTEGER r, INTEGER s }) into
 * fixed-width raw r||s. `n` is the component byte length (32 for P-256).
 * Handles the leading-zero byte DER adds when the high bit is set.
 */
export function derEcdsaSigToRaw(der: Uint8Array, n: number): Uint8Array {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("DER: expected SEQUENCE");
  // length
  let len = der[i++]!;
  if (len & 0x80) {
    const nBytes = len & 0x7f;
    if (nBytes < 1 || nBytes > 2) throw new Error("DER: unsupported length form");
    len = 0;
    for (let k = 0; k < nBytes; k++) len = (len << 8) | der[i++]!;
  }
  if (i + len !== der.length) throw new Error("DER: SEQUENCE length mismatch");

  const readInt = (): Uint8Array => {
    if (der[i++] !== 0x02) throw new Error("DER: expected INTEGER");
    let ilen = der[i++]!;
    if (ilen & 0x80) throw new Error("DER: unsupported INTEGER length");
    let start = i;
    let end = i + ilen;
    i = end;
    // Strip a single leading 0x00 (DER pads to preserve sign)
    while (end - start > 1 && der[start] === 0x00) start++;
    if (end - start > n) throw new Error("DER: INTEGER larger than curve order");
    const out = new Uint8Array(n);
    out.set(der.subarray(start, end), n - (end - start));
    return out;
  };

  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(2 * n);
  raw.set(r, 0);
  raw.set(s, n);
  return raw;
}
