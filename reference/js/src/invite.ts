// @aarmos/avar-core — Scoped Tool Invite signing + verification (Phase 2D).
//
// This module handles ONLY the cryptography (canonical body → detached
// Ed25519 signature) and the time / audience / connector checks. Structural
// validation of the invite shape lives in `@aarmos/invite-schema` so avar-core
// stays a pure crypto/verifier core with no schema fan-in.
//
// Callers are expected to:
//   1. `parseInvite(json)` with @aarmos/invite-schema first, THEN
//   2. `verifyInvite(parsed, opts)` here.

import { canonicalize, utf8 } from "./canonicalize";
import { sha256Hex } from "./hash";
import { verifySignature } from "./signature";

// ---------- shape (structural only — no runtime validation here) ----------

export interface InviteBodyShape {
  schema: string;
  inviteId: string;
  iss: string;
  issuerKey: { alg: "Ed25519"; kid: string; key: string };
  audience: { kind: "agent" | "tenant" | "open"; value?: string };
  connector: { id: string; fqdns?: string[] };
  scope: Array<{ action: string; resource: string }>;
  obligations: unknown;
  nbf: string;
  exp: string;
  maxUses: number | null;
  nonce: string;
  rekor?: unknown;
}
export interface InviteShape extends InviteBodyShape {
  sig: string;
}

/** Strip `sig` for canonical-body computation. */
export function inviteBodyOf(invite: InviteShape): InviteBodyShape {
  const { sig: _sig, ...rest } = invite;
  void _sig;
  return rest;
}

// ---------- base64url helpers (mirror ./signature.ts) ----------

function b64uEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } })
          .Buffer!.from(bin, "binary")
          .toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- signing ----------

/**
 * Detached-signer callback contract. Given the canonical UTF-8 bytes of the
 * invite body, return the raw 64-byte Ed25519 signature. Keeps avar-core
 * dependency-free of any private-key handling.
 */
export type InviteSigner = (bodyBytes: Uint8Array) => Promise<Uint8Array>;

/**
 * Produce the base64url signature for an invite body. Callers assemble the
 * final `AarmosInvite = { ...body, sig }` themselves.
 */
export async function signInviteBody(body: InviteBodyShape, sign: InviteSigner): Promise<string> {
  const bytes = utf8(canonicalize(body));
  const sig = await sign(bytes);
  return b64uEncode(sig);
}

/** Convenience: sign a body and return the fully-assembled invite. */
export async function signInvite(body: InviteBodyShape, sign: InviteSigner): Promise<InviteShape> {
  const sig = await signInviteBody(body, sign);
  return { ...body, sig };
}

/**
 * SHA-256 digest of the canonical invite body, as `sha256:<hex>`. This is
 * what a Rekor anchor commits to.
 */
export async function inviteBodyDigest(body: InviteBodyShape): Promise<`sha256:${string}`> {
  const hex = await sha256Hex(utf8(canonicalize(body)));
  return `sha256:${hex}` as const;
}

// ---------- verification ----------

export type InviteRejectReason =
  | "sig_invalid"
  | "not_yet_valid"
  | "expired"
  | "audience_mismatch"
  | "connector_mismatch"
  | "attenuation_break"
  | "issuer_key_untrusted"
  | "issuer_kid_unknown"
  | "issuer_key_mismatch"
  | "replay_max_uses_exceeded"
  | "revoked";

export interface InviteVerifyResult {
  ok: boolean;
  reason?: InviteRejectReason;
  detail?: string;
  /** Present iff ok. Convenient re-export of the parsed scope. */
  scope?: Array<{ action: string; resource: string }>;
}

export interface TrustedIssuerKey {
  kid: string;
  /** Base64url raw Ed25519 public key. */
  key: string;
}

export interface InviteVerifyOptions {
  /** Public keys the verifier trusts, keyed by kid. */
  trustedKeys: readonly TrustedIssuerKey[];
  /** Current time (ms since epoch). Injectable for determinism. */
  now?: number;
  /** Connector the caller intends to redeem against. */
  connector?: { id: string };
  /**
   * Audience the caller is asserting. `open` invites accept any caller;
   * `agent`/`tenant` invites must match the asserted value.
   */
  callerAudience?: { kind: "agent" | "tenant"; value: string };
  /**
   * Optional Rule D1 (attenuation) check: pass the issuer's own scope so
   * the verifier can confirm the invite doesn't exceed it.
   */
  issuerParentScope?: ReadonlyArray<{ action: string; resource: string }>;
  /** Optional revocation list keyed by inviteId. */
  revokedInviteIds?: ReadonlySet<string>;
  /**
   * Optional replay counter. Return the current use count for this invite
   * (0 if never redeemed). The verifier compares against `maxUses`. It does
   * NOT increment — atomic increment is the caller's responsibility once
   * the redemption is committed.
   */
  usageLookup?: (inviteId: string) => number | Promise<number>;
}

function fail(reason: InviteRejectReason, detail: string): InviteVerifyResult {
  return { ok: false, reason, detail };
}

function subsetOf(
  child: ReadonlyArray<{ action: string; resource: string }>,
  parent: ReadonlyArray<{ action: string; resource: string }>,
): boolean {
  const keys = new Set(parent.map((c) => `${c.action}:${c.resource}`));
  return child.every((c) => keys.has(`${c.action}:${c.resource}`));
}

/**
 * Verify a Scoped Tool Invite. Never throws — returns a structured result
 * so callers can surface the exact rejection reason (see spec §5).
 */
export async function verifyInvite(
  invite: InviteShape,
  opts: InviteVerifyOptions,
): Promise<InviteVerifyResult> {
  const now = opts.now ?? Date.now();

  // 1. Issuer key trust + kid match.
  const trusted = opts.trustedKeys.find((k) => k.kid === invite.issuerKey.kid);
  if (!trusted) return fail("issuer_kid_unknown", `no trusted key for kid ${invite.issuerKey.kid}`);
  if (trusted.key !== invite.issuerKey.key)
    return fail("issuer_key_mismatch", "kid resolves to a different public key");

  // 2. Signature.
  const sigOk = await verifySignature(inviteBodyOf(invite), invite.sig, trusted.key);
  if (!sigOk) return fail("sig_invalid", "signature did not verify");

  // 3. Revocation.
  if (opts.revokedInviteIds?.has(invite.inviteId))
    return fail("revoked", `invite ${invite.inviteId} is on the CRL`);

  // 4. Time window.
  const nbf = Date.parse(invite.nbf);
  const exp = Date.parse(invite.exp);
  if (now < nbf) return fail("not_yet_valid", `nbf ${invite.nbf} is in the future`);
  if (now >= exp) return fail("expired", `exp ${invite.exp} has passed`);

  // 5. Audience.
  if (invite.audience.kind !== "open") {
    const ca = opts.callerAudience;
    if (!ca || ca.kind !== invite.audience.kind || ca.value !== invite.audience.value)
      return fail(
        "audience_mismatch",
        `invite targets ${invite.audience.kind}:${invite.audience.value ?? "?"}`,
      );
  }

  // 6. Connector.
  if (opts.connector && opts.connector.id !== invite.connector.id)
    return fail(
      "connector_mismatch",
      `invite is for ${invite.connector.id}, caller is ${opts.connector.id}`,
    );

  // 7. Attenuation check — child scope must be a subset of issuer scope.
  if (opts.issuerParentScope && !subsetOf(invite.scope, opts.issuerParentScope))
    return fail("attenuation_break", "invite scope exceeds issuer's own scope");

  // 8. Replay ceiling (advisory — atomic enforcement is caller-side).
  if (invite.maxUses !== null && opts.usageLookup) {
    const used = await opts.usageLookup(invite.inviteId);
    if (used >= invite.maxUses)
      return fail("replay_max_uses_exceeded", `${used}/${invite.maxUses} uses consumed`);
  }

  return { ok: true, scope: invite.scope.map((c) => ({ ...c })) };
}
