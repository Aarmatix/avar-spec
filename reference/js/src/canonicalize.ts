// Canonical JSON per AVAR spec §2.
//
// Rules:
//   - UTF-8 (implicit — callers pass to TextEncoder).
//   - Unicode NFC normalization of all strings and keys.
//   - Object keys sorted by UTF-16 code unit order.
//   - Only string keys.
//   - undefined / functions forbidden — key omitted at object level; error inside arrays.
//   - Finite numbers only (NaN, +/-Infinity forbidden).
//   - No whitespace between tokens; no trailing newline.
//   - String escaping per JSON.stringify (which is RFC 8259 compliant) with NFC applied to input.

const NFC = (s: string): string => s.normalize("NFC");

function encodeString(s: string): string {
  return JSON.stringify(NFC(s));
}

function encodeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`avar-core/canonicalize: non-finite number (${n}) is forbidden.`);
  }
  // JSON.stringify emits the shortest round-trip form JS defines.
  return JSON.stringify(n);
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return encodeNumber(value);
  if (typeof value === "string") return encodeString(value);
  if (typeof value === "undefined") {
    throw new Error("avar-core/canonicalize: undefined is forbidden at value position.");
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new Error(`avar-core/canonicalize: ${typeof value} is forbidden.`);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys: string[] = [];
    for (const k of Object.keys(obj)) {
      // Only string keys are permitted (Object.keys guarantees strings).
      // Drop keys whose value is undefined (rule 5 of §2).
      if (obj[k] === undefined) continue;
      keys.push(NFC(k));
    }
    // UTF-16 code-unit order — this is exactly what Array.prototype.sort does
    // for strings by default.
    keys.sort();
    const parts: string[] = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      // Note: obj may hold the pre-NFC key. We re-read using the NFC key.
      // Since JS object keys are strings and NFC is stable for pure ASCII
      // (the overwhelming majority of AVAR field names), this is a no-op
      // for the standard schema. For extension keys with combining marks,
      // producers SHOULD store the NFC form to begin with.
      const rawVal = obj[k] ?? findKey(obj, k);
      parts[i] = encodeString(k) + ":" + canonicalize(rawVal);
    }
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`avar-core/canonicalize: unsupported type ${typeof value}.`);
}

function findKey(obj: Record<string, unknown>, nfcKey: string): unknown {
  // Fallback for producers that stored a non-NFC form of the key.
  for (const k of Object.keys(obj)) {
    if (NFC(k) === nfcKey) return obj[k];
  }
  return undefined;
}

/** UTF-8 encode a canonical string for hashing. */
export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
