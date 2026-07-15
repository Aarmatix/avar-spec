// Diff engine parity check. Standalone — no test runner needed.
// Run with: `bunx tsx reference/js/test/diff.test.ts` or `bun run reference/js/test/diff.test.ts`.

import {
  diffCanonical,
  diffReceipts,
  diffPolicies,
  diffToolManifests,
} from "../src/diff";
import type { AvarBundle, AvarEntry } from "../src/types";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    failed++;
    process.stderr.write(`✗ ${msg}\n`);
  } else {
    process.stdout.write(`✓ ${msg}\n`);
  }
}
function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function entry(id: string, extra: Partial<AvarEntry> = {}): AvarEntry {
  return {
    id, ts: 1, workspaceId: "ws", queryRedacted: "q", steps: [], outcome: "ok",
    ...extra,
  } as AvarEntry;
}
function bundle(entries: AvarEntry[], overrides: Partial<AvarBundle> = {}): AvarBundle {
  return {
    specVersion: "avar/1",
    manifest: {
      format: "avar/1",
      generatedAt: "2026-07-08T00:00:00Z",
      producer: { name: "test", version: "0" },
      entryCount: entries.length,
      entriesSha256: "0".repeat(64),
      chainHead: { entryHash: `h${entries.length}`, index: entries.length - 1 },
      devicePublicKeys: [],
    },
    entriesNdjsonBytes: new Uint8Array(),
    entries,
    pubkeys: { keys: [] },
    ...overrides,
  };
}

// canonical engine
{
  const d = diffCanonical({ a: 1, b: 2 }, { b: 2, a: 1 });
  assert(d.equal && d.ops.length === 0, "reordered keys equal");
}
{
  const d = diffCanonical({ a: 1 }, { a: 2 });
  assert(!d.equal && eq(d.ops, [{ op: "replace", path: "/a", oldValue: 1, value: 2 }]), "value replace");
}
{
  const d = diffCanonical({ a: 1 }, { b: 2 });
  assert(
    d.ops.some((o) => o.op === "remove" && o.path === "/a") &&
    d.ops.some((o) => o.op === "add" && o.path === "/b"),
    "add + remove keys",
  );
}
{
  const d = diffCanonical({ "a/b": [1, 2] }, { "a/b": [1, 3, 4] });
  assert(
    d.ops.some((o) => o.path === "/a~1b/1" && o.op === "replace") &&
    d.ops.some((o) => o.path === "/a~1b/2" && o.op === "add"),
    "array + pointer escaping",
  );
}

// receipts (bundle)
{
  const a = bundle([entry("e1"), entry("e2")]);
  const b = bundle([entry("e1"), entry("e2")]);
  const d = diffReceipts(a, b);
  assert(d.equal && d.entries.unchanged === 2, "identical bundles equal");
}
{
  const a = bundle([entry("e1")]);
  const b = bundle([entry("e1"), entry("e2")]);
  const d = diffReceipts(a, b);
  assert(
    !d.equal && d.entries.added.length === 1 && d.entries.added[0].id === "e2",
    "added entry detected by id",
  );
}
{
  const a = bundle([entry("e1", { signature: "sigA", steps: [] })]);
  const b = bundle([
    entry("e1", { signature: "sigB", steps: [{ kind: "text", ts: 2, preview: "hi" }] }),
  ]);
  const d = diffReceipts(a, b);
  const m = d.entries.modified[0];
  assert(m && m.signatureChanged && m.stepsChanged, "signature + steps change flagged");
}
{
  const a = bundle([entry("e1")]);
  const b = bundle([entry("e1"), entry("e2")]);
  const d = diffReceipts(a, b);
  assert(d.chainHead !== null && d.chainHead.extended === true, "chain head extension reported");
}

// receipts (single entry)
{
  const a = entry("e1", { outcome: "ok" });
  const b = entry("e1", { outcome: "error" });
  const d = diffReceipts(a, b);
  assert(
    d.kind === "entry" && !d.equal &&
    d.entries.modified[0].ops.some((o) => o.path === "/outcome"),
    "single-entry diff",
  );
}

// policies + manifests
{
  const dp = diffPolicies(
    { rules: [{ id: "r1", action: "block" }] },
    { rules: [{ id: "r1", action: "warn" }] },
  );
  assert(!dp.equal && dp.ops[0].path === "/rules/0/action", "policy rule action diff");
}
{
  const dm = diffToolManifests(
    { tools: { fs: { read: true } } },
    { tools: { fs: { read: true, write: true } } },
  );
  assert(dm.ops.some((o) => o.path === "/tools/fs/write" && o.op === "add"), "manifest capability add");
}

if (failed > 0) {
  process.stderr.write(`\n${failed} assertion(s) failed\n`);
  process.exit(1);
}
process.stdout.write("\nall diff assertions passed\n");
