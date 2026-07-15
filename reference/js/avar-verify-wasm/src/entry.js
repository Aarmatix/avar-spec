// Javy entry point for @aarmos/avar-verify-wasm.
//
// Reads a JSON payload of shape { specVersion, manifest, entries,
// entriesNdjson, pubkeys } from stdin (see README for the exact schema —
// this is a JSON-safe transport of AvarBundle where entriesNdjsonBytes is
// replaced by a UTF-8 string `entriesNdjson`). Writes a VerificationReport
// as JSON to stdout.
//
// Pure-JS crypto (noble) so it works inside Javy/QuickJS (no WebCrypto).

import { sha256 } from "@noble/hashes/sha2.js";
import { ed25519 } from "@noble/curves/ed25519.js";

// ---------- I/O (Javy-compatible) ----------
function readAllStdin() {
  const chunks = [];
  const buf = new Uint8Array(4096);
  while (true) {
    // Javy.IO.readSync returns bytes read (0 = EOF).
    const n = Javy.IO.readSync(0, buf);
    if (n === 0) break;
    chunks.push(buf.slice(0, n));
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(out);
}
function writeStdout(s) {
  const bytes = new TextEncoder().encode(s);
  Javy.IO.writeSync(1, bytes);
}

// ---------- canonical JSON (mirrors packages/avar-core/src/canonicalize.ts) ----------
const NFC = (s) => s.normalize("NFC");
function encodeString(s) { return JSON.stringify(NFC(s)); }
function encodeNumber(n) {
  if (!Number.isFinite(n)) throw new Error("non-finite number");
  return JSON.stringify(n);
}
function canonicalize(v) {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return encodeNumber(v);
  if (typeof v === "string") return encodeString(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  if (typeof v === "object") {
    const keys = [];
    for (const k of Object.keys(v)) {
      if (v[k] === undefined) continue;
      keys.push(NFC(k));
    }
    keys.sort();
    const parts = [];
    for (const k of keys) parts.push(encodeString(k) + ":" + canonicalize(v[k]));
    return "{" + parts.join(",") + "}";
  }
  throw new Error("unsupported type " + typeof v);
}
function utf8(s) { return new TextEncoder().encode(s); }
function toHex(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}
function sha256Hex(input) {
  const bytes = typeof input === "string" ? utf8(input) : input;
  return toHex(sha256(bytes));
}

// ---------- ed25519 (base64url pubkey/sig) ----------
function b64uDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function verifySignature(signedBody, sigB64u, pkB64u) {
  try {
    const pk = b64uDecode(pkB64u);
    const sig = b64uDecode(sigB64u);
    const msg = utf8(canonicalize(signedBody));
    return ed25519.verify(sig, msg, pk);
  } catch { return false; }
}
function deviceFingerprint(pkB64u) {
  return sha256Hex(utf8(pkB64u)).slice(0, 12);
}

// ---------- verify (mirrors packages/avar-core/src/verify.ts) ----------
const SPEC_VERSION = "avar/1";
const GENESIS = "0000000000000000000000000000000000000000000000000000000000000000";
const STEP_GENESIS = "step-genesis:" + GENESIS;

function computeEntryHash(entry, prevHash) {
  const withPrev = { ...entry, prevHash };
  delete withPrev.entryHash;
  delete withPrev.signature;
  delete withPrev.devicePubKey;
  return sha256Hex(prevHash + "\n" + canonicalize(withPrev));
}
function computeStepHash(step, prevStepHash) {
  const { stepHash: _s, prevStepHash: _p, ...rest } = step;
  return sha256Hex(prevStepHash + "\n" + canonicalize({ ...rest, prevStepHash }));
}
function signedBodyOf(e) {
  const { signature: _s, devicePubKey: _p, ...rest } = e;
  return rest;
}

function verifyBundle(bundle) {
  const issues = [];
  let formatOk = true;
  if (bundle.specVersion.trim() !== SPEC_VERSION) {
    formatOk = false;
    issues.push({ index: -1, kind: "spec-version-mismatch",
      detail: `Expected "${SPEC_VERSION}", got "${bundle.specVersion.trim()}".` });
  }
  if (bundle.manifest.format !== SPEC_VERSION) {
    formatOk = false;
    issues.push({ index: -1, kind: "manifest-invalid",
      detail: `manifest.format expected "${SPEC_VERSION}", got "${bundle.manifest.format}".` });
  }

  const entriesBytes = utf8(bundle.entriesNdjson);
  const actualSha = sha256Hex(entriesBytes);
  const entriesSha256Ok = actualSha === bundle.manifest.entriesSha256;
  if (!entriesSha256Ok) issues.push({ index: -1, kind: "entries-sha256-mismatch",
    detail: `Expected ${bundle.manifest.entriesSha256}, got ${actualSha}.` });

  const entries = bundle.entries;
  let signaturesOk = true, fingerprintsOk = true, signedCount = 0, unsignedCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const hasSig = typeof e.signature === "string" && typeof e.devicePubKey === "string";
    if (!hasSig) { unsignedCount++; continue; }
    signedCount++;
    if (typeof e.deviceFingerprint === "string") {
      const exp = deviceFingerprint(e.devicePubKey);
      if (exp !== e.deviceFingerprint) {
        fingerprintsOk = false;
        issues.push({ index: i, kind: "fingerprint-mismatch",
          detail: `Expected ${exp}, got ${e.deviceFingerprint}.` });
      }
    }
    if (!verifySignature(signedBodyOf(e), e.signature, e.devicePubKey)) {
      signaturesOk = false;
      issues.push({ index: i, kind: "signature-invalid" });
    }
  }

  let chainOk = true, unchainedCount = 0, expectedPrev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.entryHash || !e.prevHash) {
      unchainedCount++; expectedPrev = GENESIS; continue;
    }
    if (e.prevHash !== expectedPrev) {
      chainOk = false;
      issues.push({ index: i, kind: "chain-broken", detail: `prevHash mismatch at entry ${i}.` });
    }
    if (computeEntryHash(e, e.prevHash) !== e.entryHash) {
      chainOk = false;
      issues.push({ index: i, kind: "chain-broken",
        detail: `entryHash mismatch at entry ${i} (body modified after signing).` });
    }
    expectedPrev = e.entryHash;
  }

  let perStepChainOk = true;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!Array.isArray(e.steps) || e.steps.length === 0) continue;
    const has = (s) => typeof s.prevStepHash === "string" && typeof s.stepHash === "string";
    const any = e.steps.some(has), all = e.steps.every(has);
    if (any && !all) { perStepChainOk = false; issues.push({ index: i, kind: "partial-step-chain" }); continue; }
    if (!any) continue;
    let prev = STEP_GENESIS;
    for (let j = 0; j < e.steps.length; j++) {
      const s = e.steps[j];
      if (s.prevStepHash !== prev) {
        perStepChainOk = false;
        issues.push({ index: i, kind: "step-chain-broken",
          detail: `entry ${i} step ${j}: prevStepHash mismatch.` });
      }
      if (computeStepHash(s, s.prevStepHash) !== s.stepHash) {
        perStepChainOk = false;
        issues.push({ index: i, kind: "step-chain-broken",
          detail: `entry ${i} step ${j}: stepHash mismatch (step body modified).` });
      }
      prev = s.stepHash;
    }
  }

  let chainHead = { entryHash: "", index: -1 };
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].entryHash) { chainHead = { entryHash: entries[i].entryHash, index: i }; break; }
  }

  const anyHardFail = !formatOk || !entriesSha256Ok || !chainOk ||
    !perStepChainOk || !signaturesOk || !fingerprintsOk;
  const verdict = anyHardFail ? "invalid"
    : (unsignedCount > 0 || unchainedCount > 0) ? "valid-with-warnings" : "valid";

  return {
    formatOk, entriesSha256Ok, chainOk, perStepChainOk, signaturesOk, fingerprintsOk,
    entryCount: entries.length, signedCount, unsignedCount, unchainedCount,
    chainHead, issues, verdict,
  };
}

// ---------- main ----------
try {
  const input = readAllStdin();
  const bundle = JSON.parse(input);
  const report = verifyBundle(bundle);
  writeStdout(JSON.stringify(report));
} catch (err) {
  writeStdout(JSON.stringify({
    verdict: "invalid",
    error: "malformed",
    detail: err && err.message ? err.message : String(err),
  }));
}
