// Forward-compat probe (Pre-Flight Block 0).
//
// Proves that pre-flight receipts can ride the existing AVAR envelope with
// zero spec bump:
//   (a) An `AvarEntry` carrying an `x-preflight` extension key hashes and
//       chains identically to a stock entry — extension keys are already
//       part of the canonical body per spec §2.
//   (b) A `DecisionStep` with an unknown decision string
//       (`PREFLIGHT_PASS`) is treated as opaque data — spec §3 explicitly
//       blesses this, and `computeStepHash` is kind- and decision-agnostic.
//   (c) A step with an unknown `kind` value (`"preflight"`) also
//       reproduces — `computeStepHash` operates on the whole record.
//   (d) `replayBundle` reports `replayable: "true"` with byte-exact head
//       parity for such a bundle.
//
// If any of these fail, pre-flight needs a spec bump BEFORE shipping.
// If they pass, pre-flight ships as a pure additive under `avar/1`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEntryHash, computeStepHash, GENESIS_PREV_HASH, GENESIS_PREV_STEP_HASH } from "../src/hash.ts";
import { replayBundle } from "../src/replay.ts";
import { verifyBundle } from "../src/verify.ts";
import { canonicalize, utf8 } from "../src/canonicalize.ts";
import { sha256Hex } from "../src/hash.ts";
import type { AvarBundle, AvarEntry, TraceStep, BundleManifest, BundlePubKeys } from "../src/types.ts";

async function buildEntry(
  base: Omit<AvarEntry, "prevHash" | "entryHash">,
  prevHash: string,
): Promise<AvarEntry> {
  const withPrev = { ...base, prevHash } as AvarEntry;
  const entryHash = await computeEntryHash(withPrev, prevHash);
  return { ...withPrev, entryHash };
}

async function buildStep(step: TraceStep, prevStepHash: string): Promise<TraceStep> {
  const withPrev = { ...step, prevStepHash } as TraceStep;
  const stepHash = await computeStepHash(withPrev, prevStepHash);
  return { ...withPrev, stepHash };
}

async function assembleBundle(entries: AvarEntry[]): Promise<AvarBundle> {
  const ndjson = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const bytes = utf8(ndjson);
  const entriesSha256 = await sha256Hex(bytes);
  const last = entries[entries.length - 1]!;
  const manifest: BundleManifest = {
    format: "avar/1",
    generatedAt: new Date(0).toISOString(),
    producer: { name: "forward-compat-probe", version: "0.0.0" },
    entryCount: entries.length,
    entriesSha256,
    chainHead: { entryHash: last.entryHash!, index: entries.length - 1 },
    devicePublicKeys: [],
  };
  const pubkeys: BundlePubKeys = { keys: [] };
  return { specVersion: "avar/1", manifest, entriesNdjsonBytes: bytes, entries, pubkeys };
}

test("A1: entry with x-preflight extension reproduces head parity", async () => {
  const now = Date.now();
  const e1 = await buildEntry(
    {
      id: "e1",
      ts: now,
      workspaceId: "ws-test",
      agentName: "@aarmos/preflight",
      queryRedacted: "preflight run",
      steps: [],
      outcome: "ok",
      ["x-preflight" as `x-${string}`]: {
        verdict: "pass",
        checksRun: ["lint", "env-attest", "bridge-shape"],
        durationMs: 42,
      },
    } as AvarEntry,
    GENESIS_PREV_HASH,
  );
  const bundle = await assembleBundle([e1]);
  const r = await replayBundle(bundle);
  assert.equal(r.replayable, "true", JSON.stringify(r, null, 2));
  assert.equal(r.headMatch, true);
  assert.equal(r.reproducedHead, e1.entryHash);
});

test("A2: entry with x-preflight-fail-ref (SHA-pin) reproduces head parity", async () => {
  // FAIL variant per plan: findings are NOT inlined; entry pins a SHA-256
  // over the sidecar findings file. Verifier must still reproduce the head.
  const e1 = await buildEntry(
    {
      id: "e1",
      ts: 1,
      workspaceId: "ws-test",
      agentName: "@aarmos/preflight",
      queryRedacted: "preflight run",
      steps: [],
      outcome: "error",
      ["x-preflight" as `x-${string}`]: {
        verdict: "fail",
        findingsRef: {
          sha256: "a".repeat(64),
          path: ".aarmos/preflight/run-e1.json",
        },
      },
    } as AvarEntry,
    GENESIS_PREV_HASH,
  );
  const bundle = await assembleBundle([e1]);
  const r = await replayBundle(bundle);
  assert.equal(r.replayable, "true");
  assert.equal(r.headMatch, true);
});

test("B: decision step with unknown decision string reproduces per-step chain", async () => {
  const s1 = await buildStep(
    {
      kind: "decision",
      ts: 1,
      tool: "@aarmos/preflight",
      decision: "PREFLIGHT_PASS",
      source: "preflight",
      reason: "all checks green",
    },
    GENESIS_PREV_STEP_HASH,
  );
  const e1 = await buildEntry(
    {
      id: "e1", ts: 1, workspaceId: "ws-test",
      agentName: "@aarmos/preflight",
      queryRedacted: "preflight run",
      steps: [s1],
      outcome: "ok",
    } as AvarEntry,
    GENESIS_PREV_HASH,
  );
  const bundle = await assembleBundle([e1]);
  const r = await replayBundle(bundle);
  assert.equal(r.replayable, "true", JSON.stringify(r, null, 2));
  assert.equal(r.stepsReplayed, 1);
  assert.equal(r.headMatch, true);
});

test("C: step with unknown kind hashes and chains through", async () => {
  // Not the shape we intend to ship (we'll use `kind: "decision"`),
  // but proves forward-compat if any future writer emits a new kind.
  const s1 = await buildStep(
    {
      // Cast: intentionally unknown kind to exercise the kind-agnostic path.
      kind: "preflight",
      ts: 1,
      verdict: "pass",
    } as unknown as TraceStep,
    GENESIS_PREV_STEP_HASH,
  );
  const e1 = await buildEntry(
    {
      id: "e1", ts: 1, workspaceId: "ws-test",
      agentName: "@aarmos/preflight",
      queryRedacted: "preflight run",
      steps: [s1],
      outcome: "ok",
    } as AvarEntry,
    GENESIS_PREV_HASH,
  );
  const bundle = await assembleBundle([e1]);
  const r = await replayBundle(bundle);
  assert.equal(r.replayable, "true");
  assert.equal(r.stepsReplayed, 1);
  assert.equal(r.headMatch, true);
});

test("D: mixed preflight + normal entries chain end-to-end", async () => {
  const e1 = await buildEntry(
    {
      id: "e1", ts: 1, workspaceId: "ws-test",
      agentName: "@aarmos/preflight",
      queryRedacted: "preflight run",
      steps: [],
      outcome: "ok",
      ["x-preflight" as `x-${string}`]: { verdict: "pass", checksRun: ["lint"] },
    } as AvarEntry,
    GENESIS_PREV_HASH,
  );
  const e2 = await buildEntry(
    {
      id: "e2", ts: 2, workspaceId: "ws-test",
      agentName: "chat",
      queryRedacted: "do work",
      steps: [],
      outcome: "ok",
    } as AvarEntry,
    e1.entryHash!,
  );
  const e3 = await buildEntry(
    {
      id: "e3", ts: 3, workspaceId: "ws-test",
      agentName: "chat",
      queryRedacted: "more work",
      steps: [],
      outcome: "ok",
    } as AvarEntry,
    e2.entryHash!,
  );
  const bundle = await assembleBundle([e1, e2, e3]);
  const r = await replayBundle(bundle);
  assert.equal(r.replayable, "true", JSON.stringify(r, null, 2));
  assert.equal(r.entriesReplayed, 3);
  assert.equal(r.reproducedHead, e3.entryHash);
  assert.equal(r.headMatch, true);
});

test("E: verifyBundle accepts the same bundle (no signatures required)", async () => {
  // Unsigned entries → verdict should be `valid-with-warnings`, chainOk true.
  const e1 = await buildEntry(
    {
      id: "e1", ts: 1, workspaceId: "ws-test",
      agentName: "@aarmos/preflight",
      queryRedacted: "preflight run",
      steps: [],
      outcome: "ok",
      ["x-preflight" as `x-${string}`]: { verdict: "pass", checksRun: ["lint"] },
    } as AvarEntry,
    GENESIS_PREV_HASH,
  );
  const bundle = await assembleBundle([e1]);
  const rep = await verifyBundle(bundle);
  assert.equal(rep.chainOk, true, JSON.stringify(rep.issues, null, 2));
  assert.equal(rep.entriesSha256Ok, true);
  assert.equal(rep.formatOk, true);
  // No signatures were attached, so verdict is valid-with-warnings.
  assert.ok(rep.verdict === "valid" || rep.verdict === "valid-with-warnings");
});

test("F: canonicalize includes x-* extension keys (spec §2)", () => {
  const withExt = canonicalize({
    a: 1,
    ["x-preflight"]: { verdict: "pass" },
    z: 2,
  });
  assert.ok(withExt.includes('"x-preflight"'));
  assert.ok(withExt.includes('"verdict":"pass"'));
});

test("G: tool step with contract verdict (avar/1.3) reproduces per-step chain", async () => {
  // T2.1 / avar/1.3 additive: a `contract` field on a ToolStep must hash
  // and chain identically. Old verifiers see it as opaque data.
  const s1 = await buildStep(
    {
      kind: "tool",
      ts: 1,
      tool: "https.fetch",
      argsRedacted: { url: "https://example.com" },
      ok: true,
      ms: 12,
      // Cast: `contract` is part of `avar/1.3` — old typegen doesn't know.
      contract: {
        in: "pass",
        out: "fail",
        violations: ["out: $.status: type=number but got string"],
        fingerprint: "deadbeef",
      },
    } as unknown as TraceStep,
    GENESIS_PREV_STEP_HASH,
  );
  const e1 = await buildEntry(
    {
      id: "e1",
      ts: 1,
      workspaceId: "ws-test",
      agentName: "contract-probe",
      queryRedacted: "test contract additive",
      steps: [s1],
      outcome: "ok",
    } as AvarEntry,
    GENESIS_PREV_HASH,
  );
  const bundle = await assembleBundle([e1]);
  const r = await replayBundle(bundle);
  assert.equal(r.replayable, "true", JSON.stringify(r, null, 2));
  assert.equal(r.stepsReplayed, 1);
  assert.equal(r.headMatch, true);

  // A verifier should also accept the bundle (no signatures required here).
  const rep = await verifyBundle(bundle);
  assert.equal(rep.chainOk, true);
  assert.equal(rep.entriesSha256Ok, true);
});

