// Smoke test — chain-reproducing replay against a known-good fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { replayBundle } from "../src/replay.ts";
import type { AvarBundle, AvarEntry, BundleManifest, BundlePubKeys } from "../src/types.ts";

function parseBundle(path: string): AvarBundle {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const req = (n: string) => {
    const f = files[n];
    if (!f) throw new Error(`missing ${n}`);
    return f;
  };
  const specVersion = strFromU8(req("SPEC-VERSION")).trim();
  const manifest = JSON.parse(strFromU8(req("manifest.json"))) as BundleManifest;
  const pubkeys = JSON.parse(strFromU8(req("pubkeys.json"))) as BundlePubKeys;
  const entriesNdjsonBytes = req("entries.ndjson");
  const entries: AvarEntry[] = strFromU8(entriesNdjsonBytes)
    .split("\n").filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as AvarEntry);
  return { specVersion, manifest, entriesNdjsonBytes, entries, pubkeys };
}

test("replay reproduces multi-entry chain head", async () => {
  const b = parseBundle("test/fixtures/03-valid-multi-entry-chain.avar.zip");
  const r = await replayBundle(b);
  assert.equal(r.replayable, "true");
  assert.equal(r.headMatch, true);
  assert.equal(r.mismatches.length, 0);
  assert.equal(r.reproducedHead, r.recordedHead);
  assert.ok(r.entriesReplayed > 0);
});

test("replay reproduces per-step chain", async () => {
  const b = parseBundle("test/fixtures/04-valid-with-step-chain.avar.zip");
  const r = await replayBundle(b);
  assert.equal(r.replayable, "true");
  assert.equal(r.headMatch, true);
  assert.ok(r.stepsReplayed > 0);
});

test("replay marks tampered chain as false", async () => {
  const b = parseBundle("test/fixtures/08-invalid-chain-broken.avar.zip");
  const r = await replayBundle(b);
  assert.equal(r.replayable, "false");
  assert.ok(r.mismatches.length > 0);
});

test("replay marks legacy unchained as partial", async () => {
  const b = parseBundle("test/fixtures/05-warn-unsigned-legacy.avar.zip");
  const r = await replayBundle(b);
  // legacy fixture may be all-unchained (no entries reproduced) or mixed;
  // either way it must NOT report "true".
  assert.notEqual(r.replayable, "true");
});
