// Smoke test for dist/verify.wasm.
//
// Runs the compiled WASI verifier under Node's node:wasi host on three
// hand-crafted bundles and checks the verdict + core counters. The verifier
// core (src/entry.js) mirrors packages/avar-core/src/{canonicalize,hash,
// signature,verify} line-for-line — full JS-vs-WASM parity is enforced by
// shared source review, not runtime cross-check, because avar-core ships
// as TS and would need a separate build step to import here.
import { verifyWithWasm } from "../examples/node-host.mjs";

// sha256("") = e3b0c442… — used by both cases below.
const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

async function testEmptyValid() {
  const bundle = {
    specVersion: "avar/1",
    manifest: {
      format: "avar/1",
      generatedAt: new Date().toISOString(),
      producer: { name: "parity-test", version: "0.0.0" },
      entryCount: 0,
      entriesSha256: EMPTY_SHA,
      chainHead: { entryHash: "", index: -1 },
      devicePublicKeys: [],
    },
    entries: [],
    entriesNdjson: "",
    pubkeys: { keys: [] },
  };
  const r = await verifyWithWasm(bundle);
  if (r.verdict !== "valid") throw new Error("expected valid, got " + JSON.stringify(r));
  if (!r.formatOk || !r.entriesSha256Ok) throw new Error("expected format+sha ok");
  if (r.entryCount !== 0) throw new Error("expected entryCount=0");
  console.log("✔ empty-bundle → valid");
}

async function testBadSpec() {
  const bundle = {
    specVersion: "avar/2",
    manifest: {
      format: "avar/2",
      generatedAt: "", producer: { name: "x", version: "0" },
      entryCount: 0, entriesSha256: EMPTY_SHA,
      chainHead: { entryHash: "", index: -1 }, devicePublicKeys: [],
    },
    entries: [], entriesNdjson: "", pubkeys: { keys: [] },
  };
  const r = await verifyWithWasm(bundle);
  if (r.verdict !== "invalid" || r.formatOk !== false) {
    throw new Error("expected invalid+formatOk=false, got " + JSON.stringify(r));
  }
  console.log("✔ bad-spec → invalid");
}

async function testBadSha() {
  const bundle = {
    specVersion: "avar/1",
    manifest: {
      format: "avar/1", generatedAt: "", producer: { name: "x", version: "0" },
      entryCount: 0, entriesSha256: "0".repeat(64),
      chainHead: { entryHash: "", index: -1 }, devicePublicKeys: [],
    },
    entries: [], entriesNdjson: "", pubkeys: { keys: [] },
  };
  const r = await verifyWithWasm(bundle);
  if (r.verdict !== "invalid" || r.entriesSha256Ok !== false) {
    throw new Error("expected invalid+entriesSha256Ok=false, got " + JSON.stringify(r));
  }
  console.log("✔ tampered-sha → invalid");
}

await testEmptyValid();
await testBadSpec();
await testBadSha();
console.log("all wasm verifier checks passed");
