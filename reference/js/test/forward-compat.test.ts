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

test("H: entry with agentIdentity (avar/1.5) reproduces head parity", async () => {
  // avar/1.5 additive: agentIdentity is an optional top-level field.
  // Old verifiers see it as opaque data and MUST include it in canonical JSON.
  const e1 = await buildEntry(
    {
      id: "e1",
      ts: 1,
      workspaceId: "ws-test",
      agentName: "planner",
      queryRedacted: "identity probe",
      steps: [],
      outcome: "ok",
      // Cast: `agentIdentity` is part of `avar/1.5` — old typegen doesn't know.
      agentIdentity: {
        agentId: "planner-a",
        alg: "Ed25519",
        fingerprint: "3f9a1b2c4d5e",
      },
    } as unknown as AvarEntry,
    GENESIS_PREV_HASH,
  );
  const bundle = await assembleBundle([e1]);
  const r = await replayBundle(bundle);
  assert.equal(r.replayable, "true", JSON.stringify(r, null, 2));
  assert.equal(r.headMatch, true);
  assert.equal(r.reproducedHead, e1.entryHash);

  const rep = await verifyBundle(bundle);
  assert.equal(rep.chainOk, true);
  assert.equal(rep.entriesSha256Ok, true);
});

test("I: canonicalize includes agentIdentity field ordering", () => {
  const canon = canonicalize({
    z: 1,
    agentIdentity: { fingerprint: "abc", alg: "Ed25519", agentId: "a" },
    a: 2,
  });
  // Keys sorted alphabetically per §2; agentIdentity between "a" and "z".
  assert.ok(canon.indexOf('"agentIdentity"') > canon.indexOf('"a"'));
  assert.ok(canon.indexOf('"agentIdentity"') < canon.indexOf('"z"'));
  // Nested keys also sorted.
  assert.ok(canon.includes('"agentId":"a","alg":"Ed25519","fingerprint":"abc"'));
});

// ---- SPEC-ADDENDUM-1.5 B1: agent-signature verifier enforcement ----

import { generateKeyPairSync, sign as nodeSign, createPublicKey } from "node:crypto";

function b64u(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mint an Ed25519 keypair and return raw pubkey (32 bytes) as base64url. */
function newAgentKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" });
  const rawPub = spki.subarray(spki.length - 32);
  return { privateKey, publicKeyRaw: rawPub, publicKeyB64u: b64u(new Uint8Array(rawPub)) };
}

async function buildAgentSignedEntry(opts: {
  id: string;
  agentId: string;
  key: ReturnType<typeof newAgentKey>;
  tamper?: boolean;
}): Promise<AvarEntry> {
  // Build one chained step so the entry has a tail stepHash to sign.
  const s1 = await buildStep(
    { kind: "text", ts: 1, preview: "hello" } as TraceStep,
    GENESIS_PREV_STEP_HASH,
  );
  const base = {
    id: opts.id,
    ts: 1,
    workspaceId: "ws-test",
    agentId: opts.agentId,
    queryRedacted: "agent sig probe",
    steps: [s1],
    outcome: "ok",
    agentIdentity: {
      agentId: opts.agentId,
      alg: "Ed25519" as const,
      fingerprint: "aabbccddeeff",
      publicKey: opts.key.publicKeyB64u,
    },
  } as unknown as AvarEntry;
  const tail = s1.stepHash!;
  const sig = nodeSign(null, Buffer.from(tail, "utf8"), opts.key.privateKey);
  const sigB64u = b64u(new Uint8Array(sig));
  const withSig = {
    ...base,
    agentSignature: opts.tamper ? b64u(new Uint8Array(sig.length).fill(0x11)) : sigB64u,
  } as AvarEntry;
  return buildEntry(withSig as Omit<AvarEntry, "prevHash" | "entryHash">, GENESIS_PREV_HASH);
}

test("J: agentSignature verifies end-to-end (valid receipt)", async () => {
  const key = newAgentKey();
  const e1 = await buildAgentSignedEntry({ id: "e1", agentId: "planner-a", key });
  const bundle = await assembleBundle([e1]);
  const rep = await verifyBundle(bundle);
  assert.equal(rep.agentSignaturesOk, true, JSON.stringify(rep.issues, null, 2));
  assert.equal(rep.agentSignaturesChecked, 1);
  assert.equal(rep.agentSignaturesUnresolved, 0);
  assert.ok(rep.verdict === "valid" || rep.verdict === "valid-with-warnings");
});

test("K: tampered agentSignature triggers hard fail (agent-signature-invalid)", async () => {
  const key = newAgentKey();
  const e1 = await buildAgentSignedEntry({ id: "e1", agentId: "planner-a", key, tamper: true });
  const bundle = await assembleBundle([e1]);
  const rep = await verifyBundle(bundle);
  assert.equal(rep.agentSignaturesOk, false);
  assert.equal(rep.verdict, "invalid");
  assert.ok(rep.issues.some((i) => i.kind === "agent-signature-invalid"));
});

test("L: agentSignature without publicKey → warning, not hard fail", async () => {
  const key = newAgentKey();
  const e1full = await buildAgentSignedEntry({ id: "e1", agentId: "planner-a", key });
  // Strip publicKey to simulate a legacy pre-B1 producer.
  const stripped = {
    ...e1full,
    agentIdentity: { agentId: "planner-a", alg: "Ed25519" as const, fingerprint: "aabbccddeeff" },
  } as unknown as AvarEntry;
  const e1 = await buildEntry(
    stripped as Omit<AvarEntry, "prevHash" | "entryHash">,
    GENESIS_PREV_HASH,
  );
  const bundle = await assembleBundle([e1]);
  const rep = await verifyBundle(bundle);
  assert.equal(rep.agentSignaturesOk, true);
  assert.equal(rep.agentSignaturesUnresolved, 1);
  assert.equal(rep.agentSignaturesChecked, 0);
  assert.equal(rep.verdict, "valid-with-warnings");
  assert.ok(rep.issues.some((i) => i.kind === "agent-key-unresolved"));
});

test("M: entry without agentSignature is unaffected (backwards compat)", async () => {
  // Pure legacy entry — no agentIdentity / agentSignature at all.
  const e1 = await buildEntry(
    {
      id: "e1", ts: 1, workspaceId: "ws-test",
      agentName: "chat", queryRedacted: "hi", steps: [], outcome: "ok",
    } as AvarEntry,
    GENESIS_PREV_HASH,
  );
  const bundle = await assembleBundle([e1]);
  const rep = await verifyBundle(bundle);
  assert.equal(rep.agentSignaturesOk, true);
  assert.equal(rep.agentSignaturesChecked, 0);
  assert.equal(rep.agentSignaturesUnresolved, 0);
});


