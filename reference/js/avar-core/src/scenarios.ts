// Scenario replay (Wave — T2.2). Pure engine over AvarBundle bodies.
//
// A scenario is a small manifest of edits (entryIndex, stepIndex, patch)
// applied to a verified bundle. Applying the scenario recomputes every
// per-step hash and entry hash from GENESIS so callers can see the new
// chain head and downstream ripple without touching the original bundle
// or invoking any tools.

import {
  computeEntryHash,
  computeStepHash,
  GENESIS_PREV_HASH,
  GENESIS_PREV_STEP_HASH,
} from "./hash";
import type { AvarBundle, AvarEntry, TraceStep } from "./types";

export const SCENARIO_SCHEMA = "aarmos.scenario/1";

export type ScenarioEdit = {
  entryIndex: number;
  stepIndex: number;
  /** Sparse patch — only the listed keys overwrite the target step. */
  patch: Record<string, unknown>;
};

export type Scenario = {
  schema: typeof SCENARIO_SCHEMA;
  createdAt: string;
  /** Recorded head the scenario branched from — CI drift check. */
  sourceHead: string;
  note?: string;
  edits: ScenarioEdit[];
};

export type StepDiff = {
  entryIndex: number;
  stepIndex: number;
  kind: "unchanged" | "edited" | "downstream";
  recordedStepHash?: string;
  simulatedStepHash?: string;
};

export type EntryDiff = {
  entryIndex: number;
  recordedEntryHash?: string;
  simulatedEntryHash: string;
  changed: boolean;
};

export type ScenarioReport = {
  sourceHead: string;
  simulatedHead: string;
  headChanged: boolean;
  entries: EntryDiff[];
  steps: StepDiff[];
  editsApplied: number;
  editsSkipped: number;
};

const FORBIDDEN_STEP_KEYS = new Set(["kind", "ts", "stepHash", "prevStepHash"]);

export function buildScenario(bundle: AvarBundle, edits: ScenarioEdit[], note?: string): Scenario {
  return {
    schema: SCENARIO_SCHEMA,
    createdAt: new Date().toISOString(),
    sourceHead: bundle.manifest.chainHead.entryHash ?? "",
    note,
    edits: edits.map((e) => ({
      entryIndex: e.entryIndex,
      stepIndex: e.stepIndex,
      patch: { ...e.patch },
    })),
  };
}

export function serializeScenario(s: Scenario): string {
  return JSON.stringify(s, null, 2) + "\n";
}

export function parseScenario(text: string): Scenario {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== "object" || raw.schema !== SCENARIO_SCHEMA) {
    throw new Error(`unrecognized scenario schema (want ${SCENARIO_SCHEMA})`);
  }
  if (!Array.isArray(raw.edits)) throw new Error("scenario: edits[] missing");
  return raw as Scenario;
}

export async function replayScenario(
  bundle: AvarBundle,
  scenario: Scenario,
): Promise<ScenarioReport> {
  const editIndex = new Map<string, ScenarioEdit>();
  let editsApplied = 0;
  let editsSkipped = 0;
  for (const e of scenario.edits) editIndex.set(`${e.entryIndex}:${e.stepIndex}`, e);

  const steps: StepDiff[] = [];
  const entryDiffs: EntryDiff[] = [];
  let prevEntry = GENESIS_PREV_HASH;
  let lastHead = "";

  for (let i = 0; i < bundle.entries.length; i++) {
    const src = bundle.entries[i];
    const legacy = !src.entryHash || !src.prevHash;
    if (legacy) {
      entryDiffs.push({
        entryIndex: i,
        recordedEntryHash: src.entryHash,
        simulatedEntryHash: src.entryHash ?? "",
        changed: false,
      });
      prevEntry = GENESIS_PREV_HASH;
      continue;
    }

    const newSteps: TraceStep[] = [];
    let entryHasEdit = false;
    let prevStep = GENESIS_PREV_STEP_HASH;

    for (let j = 0; j < src.steps.length; j++) {
      const original = src.steps[j];
      const edit = editIndex.get(`${i}:${j}`);
      let effective: TraceStep = original;
      let wasEdited = false;
      if (edit) {
        const patched = applyStepPatch(original, edit.patch);
        if (patched.changed) {
          effective = patched.step;
          wasEdited = true;
          editsApplied++;
          entryHasEdit = true;
        } else {
          editsSkipped++;
        }
      }
      const participates =
        typeof original.prevStepHash === "string" && typeof original.stepHash === "string";
      if (!participates) {
        newSteps.push(effective);
        steps.push({
          entryIndex: i,
          stepIndex: j,
          kind: wasEdited ? "edited" : "unchanged",
          recordedStepHash: original.stepHash,
          simulatedStepHash: original.stepHash,
        });
        continue;
      }
      const stripped = stripStepHashes(effective);
      const simulated = await computeStepHash(stripped, prevStep);
      const recorded = original.stepHash!;
      newSteps.push({
        ...(stripped as unknown as Record<string, unknown>),
        prevStepHash: prevStep,
        stepHash: simulated,
      } as unknown as TraceStep);
      let kind: StepDiff["kind"] = "unchanged";
      if (wasEdited) kind = "edited";
      else if (simulated !== recorded) {
        kind = "downstream";
        entryHasEdit = true;
      }
      steps.push({
        entryIndex: i,
        stepIndex: j,
        kind,
        recordedStepHash: recorded,
        simulatedStepHash: simulated,
      });
      prevStep = simulated;
    }

    const rebuilt = stripEntryHashes({ ...src, steps: newSteps });
    const simulatedEntry = await computeEntryHash(rebuilt, prevEntry);
    entryDiffs.push({
      entryIndex: i,
      recordedEntryHash: src.entryHash,
      simulatedEntryHash: simulatedEntry,
      changed: entryHasEdit || simulatedEntry !== src.entryHash,
    });
    prevEntry = simulatedEntry;
    lastHead = simulatedEntry;
  }

  const sourceHead = bundle.manifest.chainHead.entryHash ?? "";
  return {
    sourceHead,
    simulatedHead: lastHead,
    headChanged: sourceHead !== lastHead,
    entries: entryDiffs,
    steps,
    editsApplied,
    editsSkipped,
  };
}

function applyStepPatch(
  step: TraceStep,
  patch: Record<string, unknown>,
): { step: TraceStep; changed: boolean } {
  let changed = false;
  const next = { ...(step as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (FORBIDDEN_STEP_KEYS.has(k)) continue;
    if (JSON.stringify(next[k]) !== JSON.stringify(v)) {
      next[k] = v;
      changed = true;
    }
  }
  return { step: next as unknown as TraceStep, changed };
}

function stripStepHashes(step: TraceStep): TraceStep {
  const rec = { ...(step as unknown as Record<string, unknown>) };
  delete rec.stepHash;
  delete rec.prevStepHash;
  return rec as unknown as TraceStep;
}

function stripEntryHashes(entry: AvarEntry): AvarEntry {
  const rec = { ...(entry as unknown as Record<string, unknown>) };
  delete rec.entryHash;
  delete rec.prevHash;
  return rec as unknown as AvarEntry;
}
