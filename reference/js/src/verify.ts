// Top-level bundle verification per AVAR spec §6.
//
// This is the ONE function that the browser drop-zone (/trust/verify) and
// the aarmos CLI both call. Parity is guaranteed by construction because
// they share this file.

import { sha256Hex, computeEntryHash, computeStepHash, GENESIS_PREV_HASH } from "./hash";
import { verifySignature, verifyRawSignature, computeDeviceFingerprint, signedBodyOf } from "./signature";
import type {
  AvarBundle,
  AvarEntry,
  TraceStep,
  VerificationIssue,
  VerificationReport,
} from "./types";

const SPEC_VERSION = "avar/1";

export async function verifyBundle(bundle: AvarBundle): Promise<VerificationReport> {
  const issues: VerificationIssue[] = [];

  // Step 1 — format
  let formatOk = true;
  const specV = bundle.specVersion.trim();
  if (specV !== SPEC_VERSION) {
    formatOk = false;
    issues.push({
      index: -1,
      kind: "spec-version-mismatch",
      detail: `Expected "${SPEC_VERSION}", got "${specV}".`,
    });
  }
  if (bundle.manifest.format !== SPEC_VERSION) {
    formatOk = false;
    issues.push({
      index: -1,
      kind: "manifest-invalid",
      detail: `manifest.format expected "${SPEC_VERSION}", got "${bundle.manifest.format}".`,
    });
  }

  // Step 2 — envelope integrity: SHA-256 of raw entries.ndjson bytes.
  const actualSha = await sha256Hex(bundle.entriesNdjsonBytes);
  const entriesSha256Ok = actualSha === bundle.manifest.entriesSha256;
  if (!entriesSha256Ok) {
    issues.push({
      index: -1,
      kind: "entries-sha256-mismatch",
      detail: `Expected ${bundle.manifest.entriesSha256}, got ${actualSha}.`,
    });
  }

  const entries = bundle.entries;
  const entryCount = entries.length;

  // Steps 4-5 — fingerprint + signature per entry.
  let signaturesOk = true;
  let fingerprintsOk = true;
  let signedCount = 0;
  let unsignedCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const hasSig = typeof e.signature === "string" && typeof e.devicePubKey === "string";
    if (!hasSig) {
      unsignedCount++;
      continue;
    }
    signedCount++;

    // Fingerprint check
    if (typeof e.deviceFingerprint === "string") {
      const expected = await computeDeviceFingerprint(e.devicePubKey!);
      if (expected !== e.deviceFingerprint) {
        fingerprintsOk = false;
        issues.push({
          index: i,
          kind: "fingerprint-mismatch",
          detail: `Expected ${expected}, got ${e.deviceFingerprint}.`,
        });
      }
    }

    // Signature check
    const ok = await verifySignature(signedBodyOf(e), e.signature!, e.devicePubKey!);
    if (!ok) {
      signaturesOk = false;
      issues.push({ index: i, kind: "signature-invalid" });
    }
  }

  // Step 6 — entry-level chain with legacy-reset (§4.2).
  let chainOk = true;
  let unchainedCount = 0;
  let expectedPrev = GENESIS_PREV_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isLegacyUnchained = !e.entryHash || !e.prevHash;
    if (isLegacyUnchained) {
      unchainedCount++;
      expectedPrev = GENESIS_PREV_HASH;
      continue;
    }
    if (e.prevHash !== expectedPrev) {
      chainOk = false;
      issues.push({
        index: i,
        kind: "chain-broken",
        detail: `prevHash mismatch at entry ${i}.`,
      });
      // Continue walking so we report all breaks, but keep expectedPrev at
      // the entry's own entryHash so subsequent entries can still verify.
    }
    const recomputed = await computeEntryHash(e, e.prevHash!);
    if (recomputed !== e.entryHash) {
      chainOk = false;
      issues.push({
        index: i,
        kind: "chain-broken",
        detail: `entryHash mismatch at entry ${i} (body modified after signing).`,
      });
    }
    expectedPrev = e.entryHash!;
  }

  // Step 7 — per-step chain.
  const perStepChainOk = await verifyAllStepChains(entries, issues);

  // Step 7.5 — SPEC-ADDENDUM-1.5 B1 — agent-signature enforcement.
  // When an entry carries `agentSignature`:
  //   • if `agentIdentity.publicKey` is present → verify Ed25519 over UTF-8
  //     bytes of the tail stepHash (or GENESIS_PREV_HASH). Mismatch is a
  //     hard fail (`agent-signature-invalid`).
  //   • if `publicKey` is absent → non-fatal warning
  //     (`agent-key-unresolved`). Legacy pre-B1 receipts, and cases where
  //     the pubkey lives out-of-band, still produce `valid-with-warnings`.
  let agentSignaturesOk = true;
  let agentSignaturesChecked = 0;
  let agentSignaturesUnresolved = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (typeof e.agentSignature !== "string") continue;
    const pk = e.agentIdentity?.publicKey;
    if (typeof pk !== "string" || pk.length === 0) {
      agentSignaturesUnresolved++;
      issues.push({
        index: i,
        kind: "agent-key-unresolved",
        detail: "agentSignature present but agentIdentity.publicKey missing.",
      });
      continue;
    }
    const tail = tailStepHash(e);
    const tailBytes = new TextEncoder().encode(tail);
    const ok = await verifyRawSignature(tailBytes, e.agentSignature, pk);
    agentSignaturesChecked++;
    if (!ok) {
      agentSignaturesOk = false;
      issues.push({
        index: i,
        kind: "agent-signature-invalid",
        detail: `entry ${i}: agentSignature does not verify against agentIdentity.publicKey.`,
      });
    }
  }

  // Step 8 — chain head.
  const chainHead = computeChainHead(entries);

  // Step 9 — verdict.
  const anyHardFail =
    !formatOk ||
    !entriesSha256Ok ||
    !chainOk ||
    !perStepChainOk ||
    !signaturesOk ||
    !fingerprintsOk ||
    !agentSignaturesOk;

  const verdict: VerificationReport["verdict"] = anyHardFail
    ? "invalid"
    : unsignedCount > 0 || unchainedCount > 0 || agentSignaturesUnresolved > 0
      ? "valid-with-warnings"
      : "valid";

  return {
    formatOk,
    entriesSha256Ok,
    chainOk,
    perStepChainOk,
    signaturesOk,
    fingerprintsOk,
    agentSignaturesOk,
    agentSignaturesChecked,
    agentSignaturesUnresolved,
    entryCount,
    signedCount,
    unsignedCount,
    unchainedCount,
    chainHead,
    issues,
    verdict,
  };
}

function tailStepHash(e: AvarEntry): string {
  const steps = Array.isArray(e.steps) ? e.steps : [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const h = steps[i]?.stepHash;
    if (typeof h === "string" && h.length > 0) return h;
  }
  return GENESIS_PREV_HASH;
}

async function verifyAllStepChains(
  entries: AvarEntry[],
  issues: VerificationIssue[],
): Promise<boolean> {
  let ok = true;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!Array.isArray(e.steps) || e.steps.length === 0) continue;

    const anyChained = e.steps.some(hasChainFields);
    const allChained = e.steps.every(hasChainFields);
    if (anyChained && !allChained) {
      ok = false;
      issues.push({ index: i, kind: "partial-step-chain" });
      continue;
    }
    if (!anyChained) continue;

    // All chained — verify.
    let prev = "step-genesis:0000000000000000000000000000000000000000000000000000000000000000";
    // Import the constant lazily to avoid cycle (already in hash.ts).
    for (let j = 0; j < e.steps.length; j++) {
      const s = e.steps[j];
      if (s.prevStepHash !== prev) {
        ok = false;
        issues.push({
          index: i,
          kind: "step-chain-broken",
          detail: `entry ${i} step ${j}: prevStepHash mismatch.`,
        });
      }
      const recomputed = await computeStepHash(s, s.prevStepHash!);
      if (recomputed !== s.stepHash) {
        ok = false;
        issues.push({
          index: i,
          kind: "step-chain-broken",
          detail: `entry ${i} step ${j}: stepHash mismatch (step body modified).`,
        });
      }
      prev = s.stepHash!;
    }
  }
  return ok;
}

function hasChainFields(s: TraceStep): boolean {
  return typeof s.prevStepHash === "string" && typeof s.stepHash === "string";
}

function computeChainHead(entries: AvarEntry[]): { entryHash: string; index: number } {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.entryHash) return { entryHash: e.entryHash, index: i };
  }
  return { entryHash: "", index: -1 };
}
