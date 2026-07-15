// Aarmos Bundle consumer — Phase 1 P1.c + P1.d, browser-safe in P2A.3.
//
// Reads a `.aarmos` file (zip), verifies:
//   1. manifest.json signature (Ed25519) against the workspace pubkey it carries
//   2. contentDigest matches the Merkle-style hash over declared contents
//   3. every declared content file is present and hashes match
//
// Optionally renders a one-page HTML report a non-engineer auditor can read.
//
// Zero network, zero daemon. Pure WebCrypto — runs in Node 20+ and browsers.

import { unzipSync, strFromU8 } from "fflate";
import {
  BUNDLE_SCHEMA_ID,
  type BundleReport,
  type BundleVerdict,
} from "./bundle-types";
import {
  rfc6962LeafHash,
  verifyInclusionProof,
  base64ToBytes,
  bytesToHex,
} from "./rekor-verify";

export { BUNDLE_SCHEMA_ID, type BundleReport, type BundleVerdict };

export function looksLikeAarmosBundle(bytes: Uint8Array): boolean {
  // ZIP magic + presence of manifest.json is checked in verifyBundleFile.
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

// Node-only helper (verifyBundleFile) has moved to `./bundle-node.ts` so this
// module stays free of `node:fs` and can be bundled for the browser.

function getSubtle(): SubtleCrypto {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (!c || !c.subtle) {
    throw new Error("avar-core: WebCrypto SubtleCrypto is unavailable. Requires Node 20+ or a modern browser.");
  }
  return c.subtle;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await getSubtle().digest("SHA-256", bytes as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyBundleBytes(bytes: Uint8Array): Promise<BundleReport> {
  const issues: BundleReport["issues"] = [];
  const report: BundleReport = {
    verdict: "invalid",
    schema: "",
    counts: {
      receipts: 0, policies: 0, egress: 0, guardrails: 0,
      receiptRows: 0, egressRows: 0, guardrailRows: 0,
    },
    issues,
    signatureValid: false,
    contentDigestValid: false,
  };

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (err) {
    issues.push({ kind: "not-a-bundle", detail: `zip parse failed: ${(err as Error).message}` });
    return report;
  }

  const manifestBytes = files["manifest.json"];
  const sigBytes = files["signatures/manifest.sig"];
  if (!manifestBytes) { issues.push({ kind: "missing-manifest", detail: "manifest.json not found" }); return report; }
  if (!sigBytes) { issues.push({ kind: "missing-signature", detail: "signatures/manifest.sig not found" }); return report; }

  let manifest: any;
  try { manifest = JSON.parse(strFromU8(manifestBytes)); }
  catch (err) { issues.push({ kind: "manifest-invalid-json", detail: (err as Error).message }); return report; }

  report.schema = manifest.schema;
  report.bundleId = manifest.bundleId;
  report.window = manifest.window;
  report.tenant = manifest.tenant;
  report.workspace = manifest.workspace
    ? { idHash: manifest.workspace.idHash, kid: manifest.workspace.publicKey?.kid }
    : undefined;
  report.producer = manifest.producer;

  if (manifest.schema !== BUNDLE_SCHEMA_ID) {
    issues.push({ kind: "schema-mismatch", detail: `expected ${BUNDLE_SCHEMA_ID}, got ${manifest.schema}` });
    return report;
  }

  // 1. Signature (Ed25519 raw 32-byte pubkey via WebCrypto).
  try {
    const rawB64Url = manifest.workspace?.publicKey?.key as string | undefined;
    if (!rawB64Url) throw new Error("workspace.publicKey.key missing");
    const rawKey = fromBase64Url(rawB64Url);
    if (rawKey.length !== 32) throw new Error(`expected 32-byte Ed25519 key, got ${rawKey.length}`);
    const pubKey = await getSubtle().importKey(
      "raw",
      rawKey as BufferSource,
      "Ed25519",
      false,
      ["verify"],
    );
    const sig = fromBase64Url(strFromU8(sigBytes).trim());
    const ok = await getSubtle().verify(
      "Ed25519",
      pubKey,
      sig as BufferSource,
      manifestBytes as BufferSource,
    );
    report.signatureValid = ok;
    if (!ok) issues.push({ kind: "signature-invalid", detail: "Ed25519 verify failed" });
  } catch (err) {
    issues.push({ kind: "signature-error", detail: (err as Error).message });
  }

  // 2. contentDigest + per-file hashes.
  const declared: Array<{ path: string; sha256: string; bytes: number }> = [];
  for (const group of ["receipts", "policies", "egress", "guardrails"] as const) {
    const arr = (manifest.contents?.[group] ?? []) as Array<{ path: string; sha256: string; bytes: number }>;
    report.counts[group] = arr.length;
    for (const e of arr) declared.push(e);
  }
  for (const e of declared) {
    const f = files[e.path];
    if (!f) { issues.push({ kind: "missing-file", detail: e.path }); continue; }
    const actual = `sha256:${await sha256Hex(f)}`;
    if (actual !== e.sha256) issues.push({ kind: "hash-mismatch", detail: `${e.path} declared ${e.sha256}, actual ${actual}` });
  }
  declared.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const digestInput = declared.map((e) => `${e.path}\t${e.sha256}`).join("\n");
  const recomputed = `sha256:${await sha256Hex(utf8(digestInput))}`;
  report.contentDigestValid = recomputed === manifest.contentDigest;
  if (!report.contentDigestValid) {
    issues.push({ kind: "content-digest-mismatch", detail: `declared ${manifest.contentDigest}, recomputed ${recomputed}` });
  }

  // Row counts (best-effort — malformed content is a warning, not fatal).
  report.counts.receiptRows = countLines(files, "receipts/");
  report.counts.egressRows = countLines(files, "egress/");
  report.counts.guardrailRows = countLines(files, "guardrails/");

  // Anchor (optional). When anchor.json is present we structurally verify
  // the inclusion proof: recompute leaf hash from the recorded Rekor entry
  // body and walk RFC 6962 up to the anchor's rootHash. A live checkpoint
  // fetch (proving rootHash is what Rekor's log actually publishes) is the
  // §2A deepening — not part of P1.e.
  if (files["anchor.json"]) {
    try {
      const a = JSON.parse(strFromU8(files["anchor.json"]));
      const ip = a.inclusionProof ?? {};
      const bodyBytes = typeof ip.body === "string" ? base64ToBytes(ip.body) : null;
      let ipResult: { valid: boolean; computedRootHex: string; reason?: string } =
        { valid: false, computedRootHex: "", reason: "inclusionProof.body missing" };
      if (bodyBytes) {
        const leafHashHex = bytesToHex(await rfc6962LeafHash(bodyBytes));
        ipResult = await verifyInclusionProof({
          leafHashHex,
          leafIndex: Number(ip.logIndex),
          treeSize: Number(ip.treeSize),
          proofHashesHex: Array.isArray(ip.hashes) ? ip.hashes : [],
          rootHashHex: String(ip.rootHash ?? ""),
        });
      }
      const digestMatchesBundle = String(a.digest) === String(manifest.contentDigest);
      report.anchor = {
        log: String(a.log ?? ""),
        logId: String(a.logId ?? ""),
        logIndex: Number(a.logIndex ?? -1),
        integratedTime: Number(a.integratedTime ?? 0),
        digest: String(a.digest ?? ""),
        digestMatchesBundle,
        inclusionProof: {
          valid: ipResult.valid,
          treeSize: Number(ip.treeSize ?? 0),
          rootHash: String(ip.rootHash ?? ""),
          computedRoot: ipResult.computedRootHex || undefined,
          reason: ipResult.reason,
        },
      };
      if (!ipResult.valid) {
        issues.push({ kind: "anchor-inclusion-invalid", detail: ipResult.reason ?? "inclusion proof did not verify" });
      }
      if (!digestMatchesBundle) {
        issues.push({
          kind: "anchor-digest-mismatch",
          detail: `anchor.digest ${a.digest} != manifest.contentDigest ${manifest.contentDigest}`,
        });
      }
    } catch (err) {
      issues.push({ kind: "anchor-invalid-json", detail: (err as Error).message });
    }
  } else if (files["anchor.pending"]) {
    let reason: string | undefined;
    let detail: string | undefined;
    try {
      const p = JSON.parse(strFromU8(files["anchor.pending"]));
      if (typeof p?.reason === "string") reason = p.reason;
      if (typeof p?.detail === "string") detail = p.detail;
    } catch { /* legacy text pending marker */ }
    report.anchor = { pending: true, reason, detail };
  }

  report.verdict = report.signatureValid && report.contentDigestValid && !issues.some((i) => isFatal(i.kind))
    ? "valid" : "invalid";
  return report;
}

// ---------- HTML report (P1.d) ----------

export function renderBundleReportHtml(r: BundleReport): string {
  const ok = r.verdict === "valid";
  const badge = ok
    ? '<span style="background:#166534;color:#fff;padding:4px 10px;border-radius:999px;font-weight:600">VALID</span>'
    : '<span style="background:#991b1b;color:#fff;padding:4px 10px;border-radius:999px;font-weight:600">INVALID</span>';
  const issues = r.issues.length
    ? `<ul>${r.issues.map((i) => `<li><code>${esc(i.kind)}</code> — ${esc(i.detail)}</li>`).join("")}</ul>`
    : "<p><em>none</em></p>";
  const anchor = r.anchor
    ? "pending" in r.anchor
      ? `<p>Rekor anchor: <em>pending</em>${r.anchor.reason ? ` (${esc(r.anchor.reason)})` : ""} — run <code>aarmos anchor push &lt;bundle&gt;</code>.</p>`
      : `<p>Rekor anchor: <code>${esc(r.anchor.log)}</code> · logIndex <code>${r.anchor.logIndex}</code> · integratedTime <code>${r.anchor.integratedTime}</code><br>
        digest matches bundle: ${r.anchor.digestMatchesBundle ? "✓" : "✗"} · inclusion proof: ${r.anchor.inclusionProof.valid ? "✓ walks to rootHash" : "✗ INVALID"}<br>
        rootHash <code>${esc(r.anchor.inclusionProof.rootHash)}</code></p>`
    : "";
  return `<!doctype html>
<html lang="en"><meta charset="utf-8">
<title>Aarmos Bundle · ${esc(r.bundleId ?? "unknown")}</title>
<style>
  body{font:14px/1.55 -apple-system,Segoe UI,Inter,sans-serif;color:#0f172a;max-width:820px;margin:32px auto;padding:0 20px}
  h1{font-size:22px;margin:0 0 8px} h2{font-size:15px;margin:24px 0 6px;color:#334155;text-transform:uppercase;letter-spacing:.06em}
  table{border-collapse:collapse;width:100%;font-size:13px} th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #e2e8f0}
  code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px}
  .k{color:#64748b;width:180px}
  footer{margin-top:32px;font-size:12px;color:#64748b}
</style>
<h1>Aarmos Bundle Report ${badge}</h1>
<p>Schema <code>${esc(r.schema)}</code> · Bundle <code>${esc(r.bundleId ?? "")}</code></p>

<h2>Window</h2>
<table><tr><td class="k">From</td><td><code>${esc(r.window?.from ?? "")}</code></td></tr>
<tr><td class="k">To</td><td><code>${esc(r.window?.to ?? "")}</code></td></tr>
<tr><td class="k">Tenant</td><td><code>${esc(r.tenant ?? "")}</code></td></tr>
<tr><td class="k">Producer</td><td><code>${esc(r.producer?.name ?? "")}@${esc(r.producer?.version ?? "")}</code></td></tr>
<tr><td class="k">Workspace</td><td><code>${esc(r.workspace?.idHash ?? "")}</code></td></tr>
<tr><td class="k">Signing key</td><td><code>${esc(r.workspace?.kid ?? "")}</code></td></tr></table>

<h2>Verification</h2>
<table><tr><td class="k">Manifest signature</td><td>${r.signatureValid ? "✓ valid (Ed25519)" : "✗ INVALID"}</td></tr>
<tr><td class="k">Content digest</td><td>${r.contentDigestValid ? "✓ matches" : "✗ MISMATCH"}</td></tr></table>

<h2>Contents</h2>
<table>
<tr><td class="k">Receipts</td><td>${r.counts.receipts} file(s) · ${r.counts.receiptRows} rows</td></tr>
<tr><td class="k">Policies</td><td>${r.counts.policies} file(s)</td></tr>
<tr><td class="k">Connector egress</td><td>${r.counts.egress} file(s) · ${r.counts.egressRows} rows</td></tr>
<tr><td class="k">Guardrail events</td><td>${r.counts.guardrails} file(s) · ${r.counts.guardrailRows} rows</td></tr>
</table>
${anchor}

<h2>Issues</h2>
${issues}

<footer>
Verified offline by <code>avar verify</code> — no Aarmos service was contacted.
Egress coverage: connector boundary only. Prompts, tool payloads, and user PII are excluded by allowlist.
</footer>
</html>
`;
}

// ---------- helpers ----------

function isFatal(kind: string): boolean {
  return ["missing-manifest", "missing-signature", "missing-file",
    "hash-mismatch", "content-digest-mismatch", "signature-invalid",
    "signature-error", "manifest-invalid-json", "schema-mismatch", "not-a-bundle"].includes(kind);
}

function countLines(files: Record<string, Uint8Array>, prefix: string): number {
  let n = 0;
  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith(prefix)) continue;
    n += strFromU8(data).split("\n").filter(Boolean).length;
  }
  return n;
}

function utf8(s: string): Uint8Array { return new TextEncoder().encode(s); }

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin =
    typeof atob === "function"
      ? atob(b64)
      : (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } })
          .Buffer!.from(b64, "base64")
          .toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
