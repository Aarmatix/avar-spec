#!/usr/bin/env bun
/**
 * `avar` — standalone AVAR receipt verifier.
 *
 * Zero network, zero Aarmos daemon. Compiled with `bun build --compile`.
 * Version: 1.0.0. Verifier: @aarmos/avar-core@1.0.0.
 *
 * Usage:
 *   avar verify <path/to/receipt.avar.zip> [--json] [--quiet] [--strict]
 *   avar --version
 *   avar --help
 *
 * Exit codes:
 *   0  valid | valid-with-warnings (0 also if --strict is off and only warnings)
 *   1  invalid, malformed, or unreadable
 *   2  file not found
 *   3  usage error
 */
import { readFileSync, existsSync } from "node:fs";
import {
  verifyBundle,
  type AvarBundle,
  type AvarEntry,
  type BundleManifest,
  type BundlePubKeys,
} from "@aarmos/avar-core";
import { unzipSync, strFromU8 } from "fflate";

const AVAR_BIN_VERSION = "1.0.0";
const AVAR_CORE_VERSION = "1.0.0";

const HELP = `avar ${AVAR_BIN_VERSION} — standalone AVAR receipt verifier

Verifies an Aarmos Verifiable Action Record (.avar.zip) bundle locally.
Signature (Ed25519), hash chain, per-step chain, and canonicalization are
checked via @aarmos/avar-core@${AVAR_CORE_VERSION}. Zero network. No daemon.

USAGE
  avar verify <receipt.avar.zip> [flags]
  avar --version
  avar --help

FLAGS
  --json     Machine-readable JSON report on stdout
  --quiet    Suppress non-error output; exit code carries the verdict
  --strict   Treat 'valid-with-warnings' as failure (exit 1)

EXIT CODES
  0  valid (or valid-with-warnings without --strict)
  1  invalid, malformed, or unreadable
  2  file not found
  3  usage error

Spec: https://github.com/Aarmatix/avar-spec
`;

type Flags = { json: boolean; quiet: boolean; strict: boolean };

function parseFlags(argv: string[]): { positional: string[]; flags: Flags } {
  const flags: Flags = { json: false, quiet: false, strict: false };
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

function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
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
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as AvarEntry);
  return { specVersion, manifest, entriesNdjsonBytes, entries, pubkeys };
}

async function runVerify(file: string, flags: Flags): Promise<number> {
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
  if (argv[0] !== "verify") {
    process.stderr.write(`avar: unknown command: ${argv[0]}\n\n${HELP}`);
    process.exit(3);
  }
  const { positional, flags } = parseFlags(argv.slice(1));
  if (positional.length !== 1) {
    process.stderr.write(`avar: 'verify' takes exactly one <receipt> argument\n`);
    process.exit(3);
  }
  const rc = await runVerify(positional[0], flags);
  process.exit(rc);
}

main().catch((err) => {
  process.stderr.write(`✗ unexpected error: ${String(err?.stack ?? err)}\n`);
  process.exit(1);
});
