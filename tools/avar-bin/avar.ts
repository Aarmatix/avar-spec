#!/usr/bin/env bun
/**
 * `avar` — standalone AVAR receipt + policy verifier & differ.
 *
 * Zero network, zero Aarmos daemon. Compiled with `bun build --compile`.
 * Version: 1.1.0. Verifier: @aarmos/avar-core@1.1.0.
 *
 * Usage:
 *   avar verify <path/to/receipt.avar.zip> [--json] [--quiet] [--strict]
 *   avar diff   <a> <b> [--kind=receipts|policies|manifests] [--json] [--quiet]
 *   avar --version
 *   avar --help
 *
 * Exit codes:
 *   0  equal / valid
 *   1  different / invalid
 *   2  file not found
 *   3  usage error
 */
import { readFileSync, existsSync } from "node:fs";
import {
  verifyBundle,
  diffReceipts,
  diffPolicies,
  diffToolManifests,
  type AvarBundle,
  type AvarEntry,
  type BundleManifest,
  type BundlePubKeys,
  type ReceiptDiff,
  type CanonicalDiff,
} from "@aarmos/avar-core";
import { unzipSync, strFromU8 } from "fflate";

const AVAR_BIN_VERSION = "1.1.0";
const AVAR_CORE_VERSION = "1.1.0";

const HELP = `avar ${AVAR_BIN_VERSION} — standalone AVAR receipt verifier & differ

Verifies an AVAR bundle (.avar.zip) locally and diffs two receipts, policies,
or tool manifests. Signature (Ed25519), hash chain, per-step chain, and
canonicalization are checked via @aarmos/avar-core@${AVAR_CORE_VERSION}.
Zero network. No daemon.

USAGE
  avar verify <receipt.avar.zip> [--json] [--quiet] [--strict]
  avar diff   <a> <b> [--kind=receipts|policies|manifests] [--json] [--quiet]
  avar --version
  avar --help

DIFF KINDS
  receipts   (default) .avar.zip bundles or single AVAR entry JSON
  policies   arbitrary policy JSON documents (structural canonical diff)
  manifests  arbitrary tool-manifest JSON documents (structural canonical diff)

EXIT CODES
  0  equal / valid  (valid-with-warnings without --strict)
  1  different / invalid / malformed / unreadable
  2  file not found
  3  usage error

Spec: https://github.com/Aarmatix/avar-spec
`;

type VerifyFlags = { json: boolean; quiet: boolean; strict: boolean };
type DiffFlags = { json: boolean; quiet: boolean; kind: "receipts" | "policies" | "manifests" };

function parseVerifyFlags(argv: string[]): { positional: string[]; flags: VerifyFlags } {
  const flags: VerifyFlags = { json: false, quiet: false, strict: false };
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg === "--json") flags.json = true;
    else if (arg === "--quiet" || arg === "-q") flags.quiet = true;
    else if (arg === "--strict") flags.strict = true;
    else if (arg.startsWith("-")) {
      process.stderr.write(`avar: unknown flag: ${arg}\n`);
      process.exit(3);
    } else positional.push(arg);
  }
  return { positional, flags };
}

function parseDiffFlags(argv: string[]): { positional: string[]; flags: DiffFlags } {
  const flags: DiffFlags = { json: false, quiet: false, kind: "receipts" };
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg === "--json") flags.json = true;
    else if (arg === "--quiet" || arg === "-q") flags.quiet = true;
    else if (arg.startsWith("--kind=")) {
      const v = arg.slice("--kind=".length);
      if (v !== "receipts" && v !== "policies" && v !== "manifests") {
        process.stderr.write(`avar: --kind must be receipts|policies|manifests\n`);
        process.exit(3);
      }
      flags.kind = v;
    } else if (arg.startsWith("-")) {
      process.stderr.write(`avar: unknown flag: ${arg}\n`);
      process.exit(3);
    } else positional.push(arg);
  }
  return { positional, flags };
}

function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
  );
}

function parseBundleBytes(bytes: Uint8Array): AvarBundle {
  const files = unzipSync(bytes);
  const requireFile = (name: string): Uint8Array => {
    const f = files[name];
    if (!f) throw new Error(`missing ${name} in bundle`);
    return f;
  };
  const specVersion = strFromU8(requireFile("SPEC-VERSION")).trim();
  const manifest = JSON.parse(strFromU8(requireFile("manifest.json"))) as BundleManifest;
  const pubkeys = JSON.parse(strFromU8(requireFile("pubkeys.json"))) as BundlePubKeys;
  const entriesNdjsonBytes = requireFile("entries.ndjson");
  const entries: AvarEntry[] = strFromU8(entriesNdjsonBytes)
    .split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l) as AvarEntry);
  return { specVersion, manifest, entriesNdjsonBytes, entries, pubkeys };
}

async function runVerify(file: string, flags: VerifyFlags): Promise<number> {
  if (!existsSync(file)) {
    if (!flags.quiet) process.stderr.write(`✗ receipt not found: ${file}\n`);
    return 2;
  }
  const bytes = readFileSync(file);
  if (!looksLikeZip(bytes)) {
    if (!flags.quiet)
      process.stderr.write(
        `✗ not an .avar.zip bundle: ${file}\n  (legacy .json receipts are parse-only; use @aarmos/cli)\n`,
      );
    return 1;
  }
  let bundle: AvarBundle;
  try {
    bundle = parseBundleBytes(bytes);
  } catch (err) {
    if (!flags.quiet) process.stderr.write(`✗ malformed .avar.zip: ${String(err)}\n`);
    return 1;
  }

  const report = await verifyBundle(bundle);
  const invalid = report.verdict === "invalid";
  const warned = report.verdict === "valid-with-warnings";

  if (flags.json) {
    process.stdout.write(JSON.stringify(report) + "\n");
  } else if (!flags.quiet) {
    const mark = invalid ? "✗" : warned ? "!" : "✓";
    process.stdout.write(`${mark} verdict: ${report.verdict}\n`);
    process.stdout.write(`  entries:   ${report.entryCount}\n`);
    process.stdout.write(`  signed:    ${report.signedCount}\n`);
    process.stdout.write(`  unsigned:  ${report.unsignedCount}\n`);
    process.stdout.write(`  unchained: ${report.unchainedCount}\n`);
    if (report.issues.length) {
      process.stdout.write(`  issues:\n`);
      for (const issue of report.issues) {
        process.stdout.write(`    - [${issue.kind}] ${issue.detail}\n`);
      }
    }
    process.stdout.write("\nverified locally — no Aarmos service was contacted.\n");
  }

  if (invalid) return 1;
  if (warned && flags.strict) return 1;
  return 0;
}

function loadDiffInput(file: string, kind: DiffFlags["kind"]): unknown {
  if (!existsSync(file)) {
    process.stderr.write(`✗ file not found: ${file}\n`);
    process.exit(2);
  }
  const bytes = readFileSync(file);
  if (kind === "receipts") {
    if (looksLikeZip(bytes)) return parseBundleBytes(bytes);
    // JSON entry / raw entry array acceptable
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch (err) {
      process.stderr.write(`✗ ${file}: not an .avar.zip and not valid JSON: ${String(err)}\n`);
      process.exit(1);
    }
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    process.stderr.write(`✗ ${file}: invalid JSON: ${String(err)}\n`);
    process.exit(1);
  }
}

function printReceiptDiff(d: ReceiptDiff): void {
  const mark = d.equal ? "✓" : "≠";
  process.stdout.write(`${mark} receipts ${d.equal ? "equal" : "differ"} (${d.kind})\n`);
  if (d.specVersion) {
    process.stdout.write(`  spec-version: ${d.specVersion.from} → ${d.specVersion.to}\n`);
  }
  if (d.chainHead) {
    const tag = d.chainHead.extended ? "extended" : "diverged";
    process.stdout.write(
      `  chain-head:   [${d.chainHead.from.index}] ${d.chainHead.from.entryHash.slice(0, 12)} → ` +
        `[${d.chainHead.to.index}] ${d.chainHead.to.entryHash.slice(0, 12)} (${tag})\n`,
    );
  }
  if (d.devicePublicKeys.added.length || d.devicePublicKeys.removed.length) {
    process.stdout.write(
      `  device keys:  +${d.devicePublicKeys.added.length} / -${d.devicePublicKeys.removed.length}\n`,
    );
  }
  process.stdout.write(
    `  entries:      +${d.entries.added.length} / -${d.entries.removed.length} / ` +
      `~${d.entries.modified.length} / =${d.entries.unchanged}\n`,
  );
  for (const a of d.entries.added) process.stdout.write(`    + ${a.id} @${a.index}\n`);
  for (const r of d.entries.removed) process.stdout.write(`    - ${r.id} @${r.index}\n`);
  for (const m of d.entries.modified) {
    const tags: string[] = [];
    if (m.signatureChanged) tags.push("sig");
    if (m.entryHashChanged) tags.push("hash");
    if (m.stepsChanged) tags.push("steps");
    process.stdout.write(
      `    ~ ${m.id}  ${m.ops.length} op(s)${tags.length ? `  [${tags.join(",")}]` : ""}\n`,
    );
  }
}

function printCanonicalDiff(d: CanonicalDiff, label: string): void {
  const mark = d.equal ? "✓" : "≠";
  process.stdout.write(`${mark} ${label} ${d.equal ? "equal" : "differ"} — ${d.ops.length} op(s)\n`);
  for (const op of d.ops) {
    if (op.op === "add") process.stdout.write(`    + ${op.path}\n`);
    else if (op.op === "remove") process.stdout.write(`    - ${op.path}\n`);
    else process.stdout.write(`    ~ ${op.path}\n`);
  }
}

async function runDiff(a: string, b: string, flags: DiffFlags): Promise<number> {
  const va = loadDiffInput(a, flags.kind);
  const vb = loadDiffInput(b, flags.kind);
  if (flags.kind === "receipts") {
    let d: ReceiptDiff;
    try {
      d = diffReceipts(va, vb);
    } catch (err) {
      process.stderr.write(`✗ ${String(err)}\n`);
      return 1;
    }
    if (flags.json) process.stdout.write(JSON.stringify(d) + "\n");
    else if (!flags.quiet) {
      printReceiptDiff(d);
      process.stdout.write("\ncompared locally — no Aarmos service was contacted.\n");
    }
    return d.equal ? 0 : 1;
  }
  const d = flags.kind === "policies" ? diffPolicies(va, vb) : diffToolManifests(va, vb);
  if (flags.json) process.stdout.write(JSON.stringify(d) + "\n");
  else if (!flags.quiet) {
    printCanonicalDiff(d, flags.kind === "policies" ? "policies" : "manifests");
    process.stdout.write("\ncompared locally — no Aarmos service was contacted.\n");
  }
  return d.equal ? 0 : 1;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    process.stdout.write(HELP);
    process.exit(argv.length === 0 ? 3 : 0);
  }
  if (argv[0] === "--version" || argv[0] === "-v") {
    process.stdout.write(`avar ${AVAR_BIN_VERSION} (@aarmos/avar-core ${AVAR_CORE_VERSION})\n`);
    process.exit(0);
  }
  if (argv[0] === "verify") {
    const { positional, flags } = parseVerifyFlags(argv.slice(1));
    if (positional.length !== 1) {
      process.stderr.write(`avar: 'verify' takes exactly one <receipt> argument\n`);
      process.exit(3);
    }
    process.exit(await runVerify(positional[0], flags));
  }
  if (argv[0] === "diff") {
    const { positional, flags } = parseDiffFlags(argv.slice(1));
    if (positional.length !== 2) {
      process.stderr.write(`avar: 'diff' takes exactly two <file> arguments\n`);
      process.exit(3);
    }
    process.exit(await runDiff(positional[0], positional[1], flags));
  }
  process.stderr.write(`avar: unknown command: ${argv[0]}\n\n${HELP}`);
  process.exit(3);
}

main().catch((err) => {
  process.stderr.write(`✗ unexpected error: ${String(err?.stack ?? err)}\n`);
  process.exit(1);
});
