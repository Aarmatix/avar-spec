// Browser-safe types + constants for the Aarmos Bundle format.
// Kept separate from `./bundle.ts` so importing the schema id/types does not
// pull `node:crypto` / `node:fs` into the client bundle.

export const BUNDLE_SCHEMA_ID = "aarmos.bundle/1" as const;

export type BundleVerdict = "valid" | "invalid";

export interface BundleReport {
  verdict: BundleVerdict;
  schema: string;
  bundleId?: string;
  window?: { from: string; to: string };
  tenant?: string;
  workspace?: { idHash: string; kid: string };
  producer?: { name: string; version: string };
  counts: {
    receipts: number;
    policies: number;
    egress: number;
    guardrails: number;
    receiptRows: number;
    egressRows: number;
    guardrailRows: number;
  };
  issues: Array<{ kind: string; detail: string }>;
  signatureValid: boolean;
  contentDigestValid: boolean;
  anchor?:
    | {
        log: string;
        logId: string;
        logIndex: number;
        integratedTime: number;
        digest: string;
        digestMatchesBundle: boolean;
        inclusionProof: {
          valid: boolean;
          treeSize: number;
          rootHash: string;
          computedRoot?: string;
          reason?: string;
        };
      }
    | { pending: true; reason?: string; detail?: string };
}
