// Ed25519 signature verification + device fingerprint per AVAR spec §3.
// Pure — WebCrypto only.

import { canonicalize, utf8 } from "./canonicalize";
import { sha256Hex } from "./hash";
import type { AvarEntry } from "./types";

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (!c || !c.subtle) {
    throw new Error("avar-core: WebCrypto SubtleCrypto is unavailable.");
  }
  return c.subtle;
}

function b64uDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  // Prefer atob when available; on Node 20+, atob is a global.
  const bin =
    typeof atob === "function"
      ? atob(b64)
      : (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } })
          .Buffer!.from(b64, "base64")
          .toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verify an Ed25519 signature over canonical JSON of `signedBody`.
 * Never throws — returns false on any parse/import/verify failure so
 * verifier callers can classify the outcome per spec §6.
 */
export async function verifySignature(
  signedBody: unknown,
  signatureB64u: string,
  publicKeyB64u: string,
): Promise<boolean> {
  try {
    const raw = b64uDecode(publicKeyB64u);
    const key = await getSubtle().importKey("raw", raw as BufferSource, "Ed25519", false, [
      "verify",
    ]);
    const sig = b64uDecode(signatureB64u);
    const bytes = utf8(canonicalize(signedBody));
    return await getSubtle().verify(
      "Ed25519",
      key,
      sig as BufferSource,
      bytes as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Compute the 12-hex device fingerprint per spec §3.2. */
export async function computeDeviceFingerprint(publicKeyB64u: string): Promise<string> {
  const hex = await sha256Hex(utf8(publicKeyB64u));
  return hex.slice(0, 12);
}

/** Extract the signed-body view of an AvarEntry per spec §3.2. */
export function signedBodyOf(entry: AvarEntry): Omit<AvarEntry, "signature" | "devicePubKey"> {
  const { signature: _sig, devicePubKey: _pk, ...rest } = entry;
  void _sig;
  void _pk;
  return rest;
}
