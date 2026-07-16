// AVAR canonical structural diff (`avar-core@1.1.0`).
//
// Pure, zero-dep. Operates on already-parsed JSON values. Uses the same
// canonical form as signature + hash paths (see canonicalize.ts) so that
// two structurally equivalent inputs always diff to `equal: true`, and any
// meaningful mutation surfaces as an add / remove / replace op with a
// JSON-Pointer-ish path.
//
// Three domain wrappers layer on top:
//   - diffReceipts(a, b)       compares two AvarBundle or AvarEntry values
//   - diffPolicies(a, b)       compares two policy documents (opaque JSON)
//   - diffToolManifests(a, b)  compares two tool-manifest documents (opaque JSON)
//
// The engine is intentionally strict: field-order is normalized via
// canonical JSON before comparison, so cosmetic reordering never produces
// noise, but ANY value change — including numeric coercion between int
// and float representations that JSON.stringify distinguishes — is flagged.

import { canonicalize } from "./canonicalize";
import type { AvarBundle, AvarEntry } from "./types";

// ---------- primitive engine ----------------------------------------------

export type DiffOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string; oldValue: unknown }
  | { op: "replace"; path: string; oldValue: unknown; value: unknown };

export type CanonicalDiff = {
  equal: boolean;
  ops: DiffOp[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function escapePointer(seg: string): string {
  // JSON Pointer (RFC 6901) escaping.
  return seg.replace(/~/g, "~0").replace(/\//g, "~1");
}

function join(base: string, seg: string | number): string {
  return `${base}/${typeof seg === "number" ? seg : escapePointer(seg)}`;
}

/** Structural, canonical diff of two JSON values. */
export function diffCanonical(a: unknown, b: unknown): CanonicalDiff {
  const ops: DiffOp[] = [];
  walk(a, b, "", ops);
  return { equal: ops.length === 0, ops };
}

function walk(a: unknown, b: unknown, path: string, ops: DiffOp[]): void {
  // Cheap fast path — canonical string equality means structurally equal.
  if (a === b) return;
  if (
    (a === null || typeof a !== "object") &&
    (b === null || typeof b !== "object")
  ) {
    if (canonicalize(a) !== canonicalize(b)) {
      ops.push({ op: "replace", path: path || "/", oldValue: a, value: b });
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const min = Math.min(a.length, b.length);
    for (let i = 0; i < min; i++) walk(a[i], b[i], join(path, i), ops);
    if (b.length > a.length) {
      for (let i = a.length; i < b.length; i++) {
        ops.push({ op: "add", path: join(path, i), value: b[i] });
      }
    } else if (a.length > b.length) {
      for (let i = b.length; i < a.length; i++) {
        ops.push({ op: "remove", path: join(path, i), oldValue: a[i] });
      }
    }
    return;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
    // Deterministic ordering — same rule as canonicalize (UTF-16 sort).
    const sorted = [...keys].sort();
    for (const k of sorted) {
      const inA = Object.prototype.hasOwnProperty.call(a, k);
      const inB = Object.prototype.hasOwnProperty.call(b, k);
      if (inA && !inB) ops.push({ op: "remove", path: join(path, k), oldValue: a[k] });
      else if (!inA && inB) ops.push({ op: "add", path: join(path, k), value: b[k] });
      else walk(a[k], b[k], join(path, k), ops);
    }
    return;
  }
  // Type mismatch (e.g. array vs object, string vs number). Replace whole node.
  ops.push({ op: "replace", path: path || "/", oldValue: a, value: b });
}

// ---------- receipt wrapper ------------------------------------------------

export type ReceiptEntryChange = {
  id: string;
  indexA: number;
  indexB: number;
  ops: DiffOp[];
  signatureChanged: boolean;
  entryHashChanged: boolean;
  stepsChanged: boolean;
};

export type ReceiptDiff = {
  equal: boolean;
  kind: "bundle" | "entry";
  specVersion: { from: string; to: string } | null;
  chainHead: {
    from: { entryHash: string; index: number };
    to: { entryHash: string; index: number };
    extended: boolean;
  } | null;
  devicePublicKeys: { added: string[]; removed: string[] };
  entries: {
    added: Array<{ id: string; index: number }>;
    removed: Array<{ id: string; index: number }>;
    modified: ReceiptEntryChange[];
    unchanged: number;
  };
  /** Raw canonical diff of manifest + pubkeys (entries handled above). */
  ops: DiffOp[];
};

function isBundle(v: unknown): v is AvarBundle {
  return (
    isPlainObject(v) &&
    typeof (v as Record<string, unknown>).specVersion === "string" &&
    isPlainObject((v as Record<string, unknown>).manifest) &&
    Array.isArray((v as Record<string, unknown>).entries)
  );
}

function isEntry(v: unknown): v is AvarEntry {
  return isPlainObject(v) && typeof v.id === "string" && Array.isArray(v.steps);
}

function diffEntryPair(a: AvarEntry, b: AvarEntry, indexA: number, indexB: number): ReceiptEntryChange {
  const { entriesNdjsonBytes: _skip1, ...aClean } = a as unknown as Record<string, unknown>;
  const { entriesNdjsonBytes: _skip2, ...bClean } = b as unknown as Record<string, unknown>;
  void _skip1; void _skip2;
  const { ops } = diffCanonical(aClean, bClean);
  const signatureChanged = ops.some((o) => o.path === "/signature" || o.path.startsWith("/signature/"));
  const entryHashChanged = ops.some((o) => o.path === "/entryHash");
  const stepsChanged = ops.some((o) => o.path === "/steps" || o.path.startsWith("/steps/"));
  return {
    id: a.id,
    indexA,
    indexB,
    ops,
    signatureChanged,
    entryHashChanged,
    stepsChanged,
  };
}

/**
 * Compare two AVAR receipts. Accepts full bundles OR single entries.
 * Entries are matched by `id`, not by index — reordering is not a diff.
 */
export function diffReceipts(a: unknown, b: unknown): ReceiptDiff {
  if (isEntry(a) && isEntry(b)) {
    const change = diffEntryPair(a, b, 0, 0);
    return {
      equal: change.ops.length === 0,
      kind: "entry",
      specVersion: null,
      chainHead: null,
      devicePublicKeys: { added: [], removed: [] },
      entries: {
        added: [],
        removed: [],
        modified: change.ops.length === 0 ? [] : [change],
        unchanged: change.ops.length === 0 ? 1 : 0,
      },
      ops: change.ops,
    };
  }
  if (!isBundle(a) || !isBundle(b)) {
    throw new Error("diffReceipts: inputs must be AvarBundle or AvarEntry values.");
  }

  const specVersion =
    a.specVersion === b.specVersion ? null : { from: a.specVersion, to: b.specVersion };

  const headA = a.manifest.chainHead;
  const headB = b.manifest.chainHead;
  const chainHead =
    headA.entryHash === headB.entryHash && headA.index === headB.index
      ? null
      : {
          from: headA,
          to: headB,
          extended: headB.index > headA.index,
        };

  const keysA = new Set(a.manifest.devicePublicKeys ?? []);
  const keysB = new Set(b.manifest.devicePublicKeys ?? []);
  const devicePublicKeys = {
    added: [...keysB].filter((k) => !keysA.has(k)).sort(),
    removed: [...keysA].filter((k) => !keysB.has(k)).sort(),
  };

  const byIdA = new Map<string, { entry: AvarEntry; index: number }>();
  a.entries.forEach((e, i) => byIdA.set(e.id, { entry: e, index: i }));
  const byIdB = new Map<string, { entry: AvarEntry; index: number }>();
  b.entries.forEach((e, i) => byIdB.set(e.id, { entry: e, index: i }));

  const added: Array<{ id: string; index: number }> = [];
  const removed: Array<{ id: string; index: number }> = [];
  const modified: ReceiptEntryChange[] = [];
  let unchanged = 0;

  for (const [id, { entry, index }] of byIdB) {
    const prior = byIdA.get(id);
    if (!prior) {
      added.push({ id, index });
      continue;
    }
    const change = diffEntryPair(prior.entry, entry, prior.index, index);
    if (change.ops.length === 0) unchanged++;
    else modified.push(change);
  }
  for (const [id, { index }] of byIdA) {
    if (!byIdB.has(id)) removed.push({ id, index });
  }
  added.sort((x, y) => x.index - y.index);
  removed.sort((x, y) => x.index - y.index);
  modified.sort((x, y) => x.indexA - y.indexA);

  // Header-level canonical diff (excluding entries + raw ndjson bytes).
  const strip = (bundle: AvarBundle) => ({
    specVersion: bundle.specVersion,
    manifest: bundle.manifest,
    pubkeys: bundle.pubkeys,
  });
  const headerDiff = diffCanonical(strip(a), strip(b));

  const equal =
    added.length === 0 &&
    removed.length === 0 &&
    modified.length === 0 &&
    headerDiff.equal;

  return {
    equal,
    kind: "bundle",
    specVersion,
    chainHead,
    devicePublicKeys,
    entries: { added, removed, modified, unchanged },
    ops: headerDiff.ops,
  };
}

// ---------- opaque-document wrappers --------------------------------------

/** Canonical diff of two policy documents. Schema-agnostic. */
export function diffPolicies(a: unknown, b: unknown): CanonicalDiff {
  return diffCanonical(a, b);
}

/** Canonical diff of two tool manifests. Schema-agnostic. */
export function diffToolManifests(a: unknown, b: unknown): CanonicalDiff {
  return diffCanonical(a, b);
}
