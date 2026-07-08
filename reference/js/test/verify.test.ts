// AVAR Phase 5 — golden fixtures + cross-runtime parity check.
//
// Runs with: `bunx tsx packages/avar-core/test/verify.test.ts`.
//
// Every fixture:
//   1. Is BUILT deterministically here (no committed binaries — the test IS
//      the spec of the fixture).
//   2. Is SERIALIZED to `test/fixtures/<name>.avar.zip` on disk so external
//      tools (aarmos CLI, the /trust/verify drop-zone) can be pointed at it.
//   3. Has an EXPECTED report written to `test/fixtures/<name>.expected.json`.
//   4. Is verified in-process via `verifyBundle()` and asserted against the
//      expected report (verdict + counts + issue kinds).
//
// The same `verifyBundle` runs in the browser drop-zone and in the CLI, so
// asserting once here guarantees three-runtime parity by construction.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync, sign as nodeSign, createPublicKey } from "node:crypto";
import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from "fflate";

import {
  canonicalize,
  computeDeviceFingerprint,
  computeEntryHash,
  computeStepHash,
  GENESIS_PREV_HASH,
  GENESIS_PREV_STEP_HASH,
  sha256Hex,
  signedBodyOf,
  utf8,
  verifyBundle,
  type AvarBundle,
  type AvarEntry,
  type BundleManifest,
  type BundlePubKeys,
  type TraceStep,
  type VerificationReport,
} from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "fixtures");
mkdirSync(OUT_DIR, { recursive: true });

const SPEC_VERSION = "avar/1";

// ---------- key helpers ----------

type KeyPair = { pubB64u: string; sign: (data: Uint8Array) => Uint8Array };

function b64u(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // Raw 32-byte public key sits in the JWK `x` field (base64url).
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  const raw = Buffer.from(jwk.x.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((jwk.x.length + 3) % 4), "base64");
  return {
    pubB64u: b64u(new Uint8Array(raw)),
    sign: (data) => new Uint8Array(nodeSign(null, Buffer.from(data), privateKey)),
  };
}

// ---------- entry builder ----------

async function makeSignedEntry(opts: {
  id: string;
  ts: number;
  key: KeyPair;
  prevHash: string;
  steps?: TraceStep[];
  agentId?: string;
}): Promise<AvarEntry> {
  const entry: AvarEntry = {
    id: opts.id,
    ts: opts.ts,
    workspaceId: "ws-golden",
    agentId: opts.agentId ?? "agent-a",
    queryRedacted: "[REDACTED]",
    steps: opts.steps ?? [],
    outcome: "ok",
  };
  // Per spec §3.2 / §4.1: everything except signature + devicePubKey is part
  // of both the entry hash AND the signed body. Order matters:
  //   (1) stamp deviceFingerprint + prevHash
  //   (2) compute entryHash over that body
  //   (3) sign the same body (verifier strips only signature + devicePubKey)
  entry.deviceFingerprint = await computeDeviceFingerprint(opts.key.pubB64u);
  entry.prevHash = opts.prevHash;
  entry.entryHash = await computeEntryHash(entry, opts.prevHash);
  const sigBytes = opts.key.sign(utf8(canonicalize(signedBodyOf(entry))));
  entry.signature = b64u(sigBytes);
  entry.devicePubKey = opts.key.pubB64u;
  return entry;
}

async function makeChainedSteps(): Promise<TraceStep[]> {
  const steps: TraceStep[] = [
    { kind: "text", ts: 1, preview: "hello" } as TraceStep,
    { kind: "tool", ts: 2, tool: "search", argsRedacted: {}, ok: true } as TraceStep,
  ];
  let prev = GENESIS_PREV_STEP_HASH;
  for (const s of steps) {
    (s as { prevStepHash?: string }).prevStepHash = prev;
    (s as { stepHash?: string }).stepHash = await computeStepHash(s, prev);
    prev = (s as { stepHash: string }).stepHash;
  }
  return steps;
}

// ---------- bundle builder (Node-only, mirrors src/lib/avar/bundle.ts) ----------

async function buildBundleBytes(entries: AvarEntry[], overrides?: {
  specVersion?: string;
  manifest?: Partial<BundleManifest>;
  mutateEntriesNdjson?: (s: string) => string;
}): Promise<Uint8Array> {
  const ndjsonRaw = entries.map((e) => canonicalize(e as unknown)).join("\n") + (entries.length ? "\n" : "");
  const ndjson = overrides?.mutateEntriesNdjson ? overrides.mutateEntriesNdjson(ndjsonRaw) : ndjsonRaw;
  const ndjsonBytes = utf8(ndjson);
  const entriesSha256 = await sha256Hex(ndjsonBytes);

  let chainHead = { entryHash: "", index: -1 };
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].entryHash) {
      chainHead = { entryHash: entries[i].entryHash!, index: i };
      break;
    }
  }

  const devicePublicKeys = [...new Set(entries.map((e) => e.devicePubKey).filter((k): k is string => !!k))].sort();

  const manifest: BundleManifest = {
    format: SPEC_VERSION,
    generatedAt: "2026-01-01T00:00:00.000Z", // fixed for determinism
    producer: { name: "avar-core-golden", version: "1.0.0-rc.1" },
    entryCount: entries.length,
    entriesSha256,
    chainHead,
    devicePublicKeys,
    ...(overrides?.manifest ?? {}),
  };

  const pubkeys: BundlePubKeys = {
    keys: await Promise.all(
      devicePublicKeys.map(async (pk) => ({
        kid: await computeDeviceFingerprint(pk),
        algorithm: "Ed25519" as const,
        publicKey: pk,
      })),
    ),
  };

  const files: Zippable = {
    "SPEC-VERSION": strToU8((overrides?.specVersion ?? SPEC_VERSION) + "\n"),
    "manifest.json": strToU8(canonicalize(manifest as unknown)),
    "entries.ndjson": ndjsonBytes,
    "pubkeys.json": strToU8(canonicalize(pubkeys as unknown)),
  };
  return zipSync(files, { level: 6 });
}

function parseBundle(bytes: Uint8Array): AvarBundle {
  const files = unzipSync(bytes);
  const specVersion = strFromU8(files["SPEC-VERSION"]).trim();
  const manifest = JSON.parse(strFromU8(files["manifest.json"])) as BundleManifest;
  const pubkeys = JSON.parse(strFromU8(files["pubkeys.json"])) as BundlePubKeys;
  const entriesBytes = files["entries.ndjson"];
  const entries: AvarEntry[] = strFromU8(entriesBytes)
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as AvarEntry);
  return { specVersion, manifest, entriesNdjsonBytes: entriesBytes, entries, pubkeys };
}

// ---------- fixtures ----------

type Expected = {
  verdict: VerificationReport["verdict"];
  entryCount: number;
  signedCount: number;
  unsignedCount: number;
  unchainedCount: number;
  issueKinds: string[]; // sorted, unique
};

type Fixture = { name: string; build: () => Promise<Uint8Array>; expected: Expected };

async function makeFixtures(): Promise<Fixture[]> {
  const key = makeKeyPair();
  const key2 = makeKeyPair();

  return [
    // 1. Empty bundle — trivially valid (0 entries, 0 unsigned).
    {
      name: "01-valid-empty",
      build: async () => buildBundleBytes([]),
      expected: {
        verdict: "valid",
        entryCount: 0,
        signedCount: 0,
        unsignedCount: 0,
        unchainedCount: 0,
        issueKinds: [],
      },
    },

    // 2. Single signed + chained entry.
    {
      name: "02-valid-single-signed",
      build: async () => {
        const e = await makeSignedEntry({ id: "e1", ts: 1000, key, prevHash: GENESIS_PREV_HASH });
        return buildBundleBytes([e]);
      },
      expected: {
        verdict: "valid",
        entryCount: 1,
        signedCount: 1,
        unsignedCount: 0,
        unchainedCount: 0,
        issueKinds: [],
      },
    },

    // 3. Three-entry chain, two devices.
    {
      name: "03-valid-multi-entry-chain",
      build: async () => {
        const e1 = await makeSignedEntry({ id: "e1", ts: 1, key, prevHash: GENESIS_PREV_HASH });
        const e2 = await makeSignedEntry({ id: "e2", ts: 2, key: key2, prevHash: e1.entryHash! });
        const e3 = await makeSignedEntry({ id: "e3", ts: 3, key, prevHash: e2.entryHash! });
        return buildBundleBytes([e1, e2, e3]);
      },
      expected: {
        verdict: "valid",
        entryCount: 3,
        signedCount: 3,
        unsignedCount: 0,
        unchainedCount: 0,
        issueKinds: [],
      },
    },

    // 4. Entry with a per-step chain.
    {
      name: "04-valid-with-step-chain",
      build: async () => {
        const steps = await makeChainedSteps();
        const e = await makeSignedEntry({ id: "e1", ts: 1, key, prevHash: GENESIS_PREV_HASH, steps });
        return buildBundleBytes([e]);
      },
      expected: {
        verdict: "valid",
        entryCount: 1,
        signedCount: 1,
        unsignedCount: 0,
        unchainedCount: 0,
        issueKinds: [],
      },
    },

    // 5. Unsigned legacy entry → valid-with-warnings.
    {
      name: "05-warn-unsigned-legacy",
      build: async () => {
        const e: AvarEntry = {
          id: "legacy-1",
          ts: 1,
          workspaceId: "ws-golden",
          queryRedacted: "[REDACTED]",
          steps: [],
          outcome: "ok",
        };
        return buildBundleBytes([e]);
      },
      expected: {
        verdict: "valid-with-warnings",
        entryCount: 1,
        signedCount: 0,
        unsignedCount: 1,
        unchainedCount: 1,
        issueKinds: [],
      },
    },

    // 6. Wrong SPEC-VERSION file → format fail.
    {
      name: "06-invalid-spec-version",
      build: async () => {
        const e = await makeSignedEntry({ id: "e1", ts: 1, key, prevHash: GENESIS_PREV_HASH });
        return buildBundleBytes([e], { specVersion: "avar/999" });
      },
      expected: {
        verdict: "invalid",
        entryCount: 1,
        signedCount: 1,
        unsignedCount: 0,
        unchainedCount: 0,
        issueKinds: ["spec-version-mismatch"],
      },
    },

    // 7. entries.ndjson mutated after manifest computed → sha256 mismatch
    //    AND (because a chained entry byte changed) chain/signature checks
    //    should also flag.
    {
      name: "07-invalid-entries-sha256",
      build: async () => {
        const e = await makeSignedEntry({ id: "e1", ts: 1, key, prevHash: GENESIS_PREV_HASH });
        const good = await buildBundleBytes([e]);
        // Recompute manifest from clean bytes, then swap in a mutated NDJSON.
        const files = unzipSync(good);
        const mutated = strFromU8(files["entries.ndjson"]).replace(/"outcome":"ok"/, '"outcome":"error"');
        files["entries.ndjson"] = utf8(mutated);
        return zipSync(files, { level: 6 });
      },
      expected: {
        verdict: "invalid",
        entryCount: 1,
        signedCount: 1,
        unsignedCount: 0,
        unchainedCount: 0,
        // sha256 fails; the mutated body also invalidates signature + entryHash.
        issueKinds: ["chain-broken", "entries-sha256-mismatch", "signature-invalid"],
      },
    },

    // 8. Chain break: two entries where second declares wrong prevHash.
    {
      name: "08-invalid-chain-broken",
      build: async () => {
        const e1 = await makeSignedEntry({ id: "e1", ts: 1, key, prevHash: GENESIS_PREV_HASH });
        // Deliberately point e2 at a bogus prevHash.
        const e2 = await makeSignedEntry({
          id: "e2",
          ts: 2,
          key,
          prevHash: "f".repeat(64),
        });
        return buildBundleBytes([e1, e2]);
      },
      expected: {
        verdict: "invalid",
        entryCount: 2,
        signedCount: 2,
        unsignedCount: 0,
        unchainedCount: 0,
        issueKinds: ["chain-broken"],
      },
    },
  ];
}

// ---------- runner ----------

function uniqSortedKinds(report: VerificationReport): string[] {
  return [...new Set(report.issues.map((i) => i.kind))].sort();
}

function eqArr(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function main(): Promise<void> {
  const fixtures = await makeFixtures();
  const failures: string[] = [];

  for (const fx of fixtures) {
    const bytes = await fx.build();
    const zipPath = join(OUT_DIR, `${fx.name}.avar.zip`);
    writeFileSync(zipPath, bytes);

    const bundle = parseBundle(bytes);
    const report = await verifyBundle(bundle);

    const gotKinds = uniqSortedKinds(report);
    const exp = fx.expected;
    const ok =
      report.verdict === exp.verdict &&
      report.entryCount === exp.entryCount &&
      report.signedCount === exp.signedCount &&
      report.unsignedCount === exp.unsignedCount &&
      report.unchainedCount === exp.unchainedCount &&
      eqArr(gotKinds, exp.issueKinds);

    writeFileSync(
      join(OUT_DIR, `${fx.name}.expected.json`),
      JSON.stringify({ ...exp, issueKindsFromRun: gotKinds }, null, 2) + "\n",
    );

    if (ok) {
      console.log(`  ✔ ${fx.name}  →  ${report.verdict}`);
    } else {
      failures.push(fx.name);
      console.error(`  ✖ ${fx.name}`);
      console.error(`      expected: ${JSON.stringify(exp)}`);
      console.error(`      got:      verdict=${report.verdict} entry=${report.entryCount} signed=${report.signedCount} unsigned=${report.unsignedCount} unchained=${report.unchainedCount} kinds=${JSON.stringify(gotKinds)}`);
    }
  }

  // Suppress unused-import warning when only using createPublicKey for docs.
  void createPublicKey;

  // Cross-runtime parity smoke: run the CLI's verifier against every fixture
  // on disk via a shim that loads only `commands/verify.ts` (skipping the
  // full CLI's optional deps like simple-git). Runs from the CLI package
  // cwd so its tsconfig path alias `@aarmos/avar-core` resolves.
  const { spawnSync } = await import("node:child_process");
  const cliDir = join(HERE, "..", "..", "cli");
  const shim = join(HERE, "cli-shim.ts");
  for (const fx of fixtures) {
    const zipPath = join(OUT_DIR, `${fx.name}.avar.zip`);
    const res = spawnSync("bunx", ["tsx", shim, zipPath], {
      cwd: cliDir,
      encoding: "utf8",
    });
    const expectedRc = fx.expected.verdict === "invalid" ? 1 : 0;
    if (res.status !== expectedRc) {
      failures.push(`${fx.name} (CLI rc=${res.status} want ${expectedRc})`);
      console.error(`  ✖ CLI parity: ${fx.name}  rc=${res.status} want=${expectedRc}`);
      if (res.stderr) console.error(`      stderr: ${res.stderr.slice(0, 200)}`);
    } else {
      console.log(`  ✔ CLI parity: ${fx.name}  rc=${res.status}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\nAVAR golden fixtures: ${failures.length} FAILED`);
    process.exit(1);
  }
  console.log(`\nAVAR golden fixtures: ${fixtures.length}/${fixtures.length} passed (in-proc + CLI).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
