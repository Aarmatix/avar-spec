// Chain-Reproducing Replay (Moat Layer P2B.2).
//
// Given an AvarBundle, re-derive every stepHash and entryHash purely from
// the recorded bodies and assert head-parity with the manifest. This proves
// the receipt is a *functional state-substrate*, not a passive log: the
// same inputs (canonical bodies) MUST reproduce the same chain head, or
// the receipt is not authentic.
//
// This is deliberately narrower than verifyBundle: no signatures, no
// entriesSha256 envelope. verifyBundle answers "is this bundle authentic?"
// Replay answers "does this bundle *reproduce*?" — and returns the
// re-derived head so callers can pin it in CI.

import { computeEntryHash, computeStepHash, GENESIS_PREV_HASH, GENESIS_PREV_STEP_HASH } from "./hash";
import type { AvarBundle, AvarEntry, TraceStep } from "./types";

export type ReplayMismatch = {
  kind: "step-hash-mismatch" | "entry-hash-mismatch" | "prev-hash-mismatch" | "head-mismatch";
  entryIndex: number;
  stepIndex?: number;
  expected: string;
  actual: string;
};

export type ChainReplayReport = {
  /**
   *   "true"    — every chained entry re-derives and head parity holds.
   *   "partial" — some entries lack chain fields (legacy unchained); the
   *               chained subset still reproduces exactly.
   *   "false"   — at least one re-derivation diverges from the recorded
   *               value, OR head parity fails.
   */
  replayable: "true" | "partial" | "false";
  headMatch: boolean;
  recordedHead: string;
  reproducedHead: string;
  entriesReplayed: number;
  entriesSkipped: number;
  stepsReplayed: number;
  mismatches: ReplayMismatch[];
};

/**
 * Re-derive the full hash chain from the recorded bodies.
 * Zero network, zero signatures — pure math over canonical JSON.
 */
export async function replayBundle(bundle: AvarBundle): Promise<ChainReplayReport> {
  const mismatches: ReplayMismatch[] = [];
  const entries = bundle.entries;

  let entriesReplayed = 0;
  let entriesSkipped = 0;
  let stepsReplayed = 0;
  let expectedPrev = GENESIS_PREV_HASH;
  let lastReproducedHead = "";

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isLegacyUnchained = !e.entryHash || !e.prevHash;
    if (isLegacyUnchained) {
      entriesSkipped++;
      expectedPrev = GENESIS_PREV_HASH;
      continue;
    }

    // Per-step chain (only if this entry uses per-step hashing).
    if (Array.isArray(e.steps) && e.steps.some(hasStepChain)) {
      let prevStep = GENESIS_PREV_STEP_HASH;
      for (let j = 0; j < e.steps.length; j++) {
        const s = e.steps[j];
        if (!hasStepChain(s)) continue;
        if (s.prevStepHash !== prevStep) {
          mismatches.push({
            kind: "prev-hash-mismatch",
            entryIndex: i,
            stepIndex: j,
            expected: prevStep,
            actual: s.prevStepHash!,
          });
        }
        const reproduced = await computeStepHash(s, s.prevStepHash!);
        if (reproduced !== s.stepHash) {
          mismatches.push({
            kind: "step-hash-mismatch",
            entryIndex: i,
            stepIndex: j,
            expected: s.stepHash!,
            actual: reproduced,
          });
        }
        prevStep = s.stepHash!;
        stepsReplayed++;
      }
    }

    // Entry-level chain.
    if (e.prevHash !== expectedPrev) {
      mismatches.push({
        kind: "prev-hash-mismatch",
        entryIndex: i,
        expected: expectedPrev,
        actual: e.prevHash!,
      });
    }
    const reproducedEntry = await computeEntryHash(e, e.prevHash!);
    if (reproducedEntry !== e.entryHash) {
      mismatches.push({
        kind: "entry-hash-mismatch",
        entryIndex: i,
        expected: e.entryHash!,
        actual: reproducedEntry,
      });
    }
    expectedPrev = e.entryHash!;
    lastReproducedHead = reproducedEntry;
    entriesReplayed++;
  }

  const recordedHead = bundle.manifest.chainHead.entryHash ?? "";
  const reproducedHead = lastReproducedHead;
  const headMatch = entriesReplayed > 0 && recordedHead === reproducedHead;

  if (entriesReplayed > 0 && !headMatch) {
    mismatches.push({
      kind: "head-mismatch",
      entryIndex: bundle.manifest.chainHead.index ?? entries.length - 1,
      expected: recordedHead,
      actual: reproducedHead,
    });
  }

  const hasHardFail = mismatches.length > 0;
  const replayable: ChainReplayReport["replayable"] = hasHardFail
    ? "false"
    : entriesSkipped > 0
      ? "partial"
      : "true";

  return {
    replayable,
    headMatch,
    recordedHead,
    reproducedHead,
    entriesReplayed,
    entriesSkipped,
    stepsReplayed,
    mismatches,
  };
}

function hasStepChain(s: TraceStep): boolean {
  return typeof s.prevStepHash === "string" && typeof s.stepHash === "string";
}

/** Convenience: extract every ToolStep + DecisionStep for a policy-regression pass. */
export function extractDecisionSurface(entry: AvarEntry): TraceStep[] {
  return (entry.steps ?? []).filter(
    (s) => s.kind === "tool" || s.kind === "decision",
  );
}
