// SPEC-ADDENDUM-1.9 — receipt governance-chain verifier.
//
// Pure function of (entries, manifests[]). No I/O, no fetching — rule G3.
// Callable from Node + browser. The CLI `avar verify --trust-manifest`
// flag and the browser `/trust/verify` drop-zone both call `verifyGovernance`
// so parity is guaranteed by construction (same story as `verifyBundle`).
//
// Shape of a caller-supplied manifest: the *predicate* extracted from a
// `trustmanifest/v1` DSSE envelope (see SPEC-ADDENDUM-1.7/1.8). Extraction
// (DSSE parse + Ed25519 verify) is a caller responsibility so this module
// stays free of the attest wire — @aarmos/avar-core doesn't own DSSE.

import type { AvarEntry, VerificationIssue } from "./types";
import { canonicalize, utf8 } from "./canonicalize";
import { sha256Hex } from "./hash";

export interface GovernanceManifestInput {
  authorityId: string;
  sequence: number;
  entries: { fingerprint: string; label?: string; notes?: string }[];
}

export type GovernanceVerdict =
  | "governed"           // manifest matched, sequence ok, policy digest listed
  | "unverified"         // no manifest supplied for this authority (advisory)
  | "unclaimed";         // receipt has no governance block — nothing to check

export interface EntryGovernanceReport {
  index: number;
  verdict: GovernanceVerdict;
  claimed?: { authorityId: string; manifestSequence: number; policyDigest: string; policyLabel?: string };
  matchedManifest?: { authorityId: string; sequence: number };
  issues: VerificationIssue[];
}



export interface GovernanceReport {
  ok: boolean;             // false iff any hard reject (mismatch / stale / unlisted)
  governedCount: number;
  unverifiedCount: number;
  unclaimedCount: number;
  perEntry: EntryGovernanceReport[];
  issues: VerificationIssue[]; // flat aggregate of hard failures
}

export interface VerifyGovernanceOptions {
  /** Authority manifests the caller wants receipts checked against. */
  manifests?: GovernanceManifestInput[];
  /**
   * Strict mode. When true, any receipt that claims a governance block for
   * which no matching manifest was supplied is treated as a HARD failure
   * (issue kind `governance-unverified` is escalated). Default: false —
   * unmatched claims are advisory. Used by `aarmos verify --fail-on-ungoverned`.
   */
  treatMissingManifestAsError?: boolean;
}


/**
 * SPEC-1.9 rule G4: match each entry to the manifest whose authority.id
 * equals `governance.authorityId`. Unmatched → advisory. Matched but
 * stale/unlisted → hard fail.
 */
export function verifyGovernance(
  entries: AvarEntry[],
  opts: VerifyGovernanceOptions = {},
): GovernanceReport {
  const manifests = opts.manifests ?? [];
  // Index manifests by authorityId. When the caller supplies two manifests
  // for the same authority (e.g. old + new during a re-pin window), pick
  // the highest sequence — that's the operator's freshest belief.
  const byAuthority = new Map<string, GovernanceManifestInput>();
  for (const m of manifests) {
    const prev = byAuthority.get(m.authorityId);
    if (!prev || m.sequence > prev.sequence) byAuthority.set(m.authorityId, m);
  }

  const perEntry: EntryGovernanceReport[] = [];
  const flatIssues: VerificationIssue[] = [];
  let governedCount = 0;
  let unverifiedCount = 0;
  let unclaimedCount = 0;
  let anyHardFail = false;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const claim = e.governance;
    if (!claim) {
      unclaimedCount++;
      perEntry.push({ index: i, verdict: "unclaimed", issues: [] });
      continue;
    }
    const matched = byAuthority.get(claim.authorityId);
    if (!matched) {
      unverifiedCount++;
      const issue: VerificationIssue = {
        index: i,
        kind: "governance-unverified",
        detail: `no manifest supplied for authority ${claim.authorityId}`,
      };
      if (opts.treatMissingManifestAsError) {
        anyHardFail = true;
        flatIssues.push(issue);
      }
      perEntry.push({
        index: i,
        verdict: "unverified",
        claimed: { ...claim },
        issues: [issue],
      });
      continue;
    }

    const issues: VerificationIssue[] = [];



    // G rule: `governance-sequence-stale` — supplied manifest is older than
    // what the receipt says it was governed under. This means the caller's
    // trust view is behind the receipt's; they need a fresher manifest.
    if (matched.sequence < claim.manifestSequence) {
      issues.push({
        index: i,
        kind: "governance-sequence-stale",
        detail: `manifest at seq ${matched.sequence} < receipt-claimed seq ${claim.manifestSequence} (fetch a newer manifest)`,
      });
    }

    // `governance-policy-unlisted` — the digest the runtime stamped is not
    // listed in this manifest's entries. Either the manifest doesn't govern
    // this policy or the receipt is claiming a policy the authority never
    // published.
    const wantedDigest = normalizeDigest(claim.policyDigest);
    const found = matched.entries.some((entry) => normalizeDigest(entry.fingerprint) === wantedDigest);
    if (!found) {
      issues.push({
        index: i,
        kind: "governance-policy-unlisted",
        detail: `policyDigest ${claim.policyDigest} not listed by authority ${matched.authorityId} at seq ${matched.sequence}`,
      });
    }

    if (issues.length > 0) {
      anyHardFail = true;
      flatIssues.push(...issues);
      perEntry.push({
        index: i,
        verdict: "unverified",
        claimed: { ...claim },
        matchedManifest: { authorityId: matched.authorityId, sequence: matched.sequence },
        issues,
      });
      continue;
    }

    governedCount++;
    perEntry.push({
      index: i,
      verdict: "governed",
      claimed: { ...claim },
      matchedManifest: { authorityId: matched.authorityId, sequence: matched.sequence },
      issues: [],
    });
  }

  return {
    ok: !anyHardFail,
    governedCount,
    unverifiedCount,
    unclaimedCount,
    perEntry,
    issues: flatIssues,
  };
}

/**
 * Accept both `sha256:<hex>` and bare `<hex>` forms. Manifest entries
 * historically list fingerprints as bare hex (see SPEC-1.7). Receipts
 * stamp digests as `sha256:<hex>` per SPEC-1.9. The verifier bridges.
 */
function normalizeDigest(raw: string): string {
  const s = raw.trim().toLowerCase();
  return s.startsWith("sha256:") ? s.slice("sha256:".length) : s;
}

/**
 * SPEC-1.9 Governance Fingerprint — first 8 hex chars of the SHA-256 of
 * `canonicalize({ authorityId, manifestSequence, policyDigest })`, rendered
 * as `GOV-<8UPPER>`. Derived, never stored on the wire. Two claims with
 * the same fingerprint were governed identically.
 *
 * ADR-0004: pure function of the claim bytes — no I/O.
 */
export async function governanceFingerprint(claim: {
  authorityId: string;
  manifestSequence: number;
  policyDigest: string;
}): Promise<string> {
  const canon = canonicalize({
    authorityId: claim.authorityId,
    manifestSequence: claim.manifestSequence,
    policyDigest: normalizeDigest(claim.policyDigest),
  });
  const hex = await sha256Hex(utf8(canon));
  return `GOV-${hex.slice(0, 8).toUpperCase()}`;
}

