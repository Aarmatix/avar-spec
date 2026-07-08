// Hash + chain math per AVAR spec §4.
//
// Uses globalThis.crypto.subtle (available in browsers and Node 20+).
// Pure — no DOM, no Node built-ins.

import { canonicalize, utf8 } from "./canonicalize";
import type { AvarEntry, TraceStep } from "./types";

export const GENESIS_PREV_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

export const GENESIS_PREV_STEP_HASH =
  "step-genesis:0000000000000000000000000000000000000000000000000000000000000000";

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (!c || !c.subtle) {
    throw new Error(
      "avar-core: WebCrypto SubtleCrypto is unavailable. Requires Node 20+ or a modern browser.",
    );
  }
  return c.subtle;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? utf8(input) : input;
  const digest = await getSubtle().digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute entry hash per spec §4.1.
 *
 * chainBody = canonicalize(entry with { entryHash: undefined,
 *                                       signature: undefined,
 *                                       devicePubKey: undefined })
 *
 * NOTE: signature and devicePubKey are ALSO excluded because they are not
 * part of the signed body (spec §3.2). Including them would make the chain
 * hash change when the signature is added, creating an ordering paradox.
 */
export async function computeEntryHash(
  entry: AvarEntry,
  prevHash: string,
): Promise<string> {
  const withPrev: AvarEntry = { ...entry, prevHash };
  const {
    entryHash: _e,
    signature: _sig,
    devicePubKey: _pk,
    ...rest
  } = withPrev;
  void _e;
  void _sig;
  void _pk;
  return sha256Hex(prevHash + "\n" + canonicalize(rest));
}

/** Compute per-step hash per spec §4.3. */
export async function computeStepHash(
  step: TraceStep,
  prevStepHash: string,
): Promise<string> {
  const asRec = step as unknown as Record<string, unknown>;
  const { stepHash: _s, prevStepHash: _p, ...rest } = asRec;
  void _s;
  void _p;
  const withPrev = { ...rest, prevStepHash };
  return sha256Hex(prevStepHash + "\n" + canonicalize(withPrev));
}
