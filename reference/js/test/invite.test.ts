// Run: bunx tsx packages/avar-core/test/invite.test.ts
//
// Covers Phase 2D crypto path in @aarmos/avar-core:
//   - signInvite round-trips through verifyInvite
//   - tampering, expiry, audience, connector, attenuation, kid trust,
//     revocation, and replay ceiling all reject with the documented reason.

import { strict as assert } from "node:assert";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";

import {
  signInvite,
  verifyInvite,
  inviteBodyOf,
  inviteBodyDigest,
  type InviteBodyShape,
  type InviteShape,
  type TrustedIssuerKey,
} from "../src/invite.js";

// ---------- key helpers (Node crypto → base64url raw Ed25519) ----------

function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeKey(): { pubB64u: string; signer: (data: Uint8Array) => Promise<Uint8Array> } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return {
    pubB64u: b64u(rawPub),
    signer: async (data: Uint8Array) => {
      const sig = nodeSign(null, data, privateKey);
      return new Uint8Array(sig.buffer, sig.byteOffset, sig.byteLength);
    },
  };
}

function body(kid: string, pub: string, over: Partial<InviteBodyShape> = {}): InviteBodyShape {
  const now = Date.now();
  return {
    schema: "aarmos.invite/1",
    inviteId: "inv_01HZY8QK7X3M4N5P6Q7R8S9T0V",
    iss: "ws_test",
    issuerKey: { alg: "Ed25519", kid, key: pub },
    audience: { kind: "agent", value: "agent_a" },
    connector: { id: "mcp:github" },
    scope: [
      { action: "read", resource: "data" },
      { action: "execute", resource: "tool" },
    ],
    obligations: { receiptRequired: true },
    nbf: new Date(now - 60_000).toISOString(),
    exp: new Date(now + 3_600_000).toISOString(),
    maxUses: 3,
    nonce: "abcdefghijklmnopqrstuv",
    ...over,
  };
}

let ran = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    ran++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

const KID = "test-key-1";

async function main() {
  const key = makeKey();
  const trusted: TrustedIssuerKey[] = [{ kid: KID, key: key.pubB64u }];

  let signed: InviteShape;
  await t("signInvite → verifyInvite round-trips", async () => {
    signed = await signInvite(body(KID, key.pubB64u), key.signer);
    const r = await verifyInvite(signed, {
      trustedKeys: trusted,
      connector: { id: "mcp:github" },
      callerAudience: { kind: "agent", value: "agent_a" },
    });
    assert.equal(r.ok, true, r.detail ?? "");
    assert.deepEqual(r.scope, [
      { action: "read", resource: "data" },
      { action: "execute", resource: "tool" },
    ]);
  });

  await t("tampered scope fails signature", async () => {
    const tampered: InviteShape = {
      ...signed!,
      scope: [{ action: "delete", resource: "data" }],
    };
    const r = await verifyInvite(tampered, {
      trustedKeys: trusted,
      connector: { id: "mcp:github" },
      callerAudience: { kind: "agent", value: "agent_a" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "sig_invalid");
  });

  await t("expired invite rejects with 'expired'", async () => {
    const b = body(KID, key.pubB64u, {
      nbf: new Date(Date.now() - 7200_000).toISOString(),
      exp: new Date(Date.now() - 3600_000).toISOString(),
    });
    const inv = await signInvite(b, key.signer);
    const r = await verifyInvite(inv, {
      trustedKeys: trusted,
      callerAudience: { kind: "agent", value: "agent_a" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "expired");
  });

  await t("wrong audience rejects with 'audience_mismatch'", async () => {
    const r = await verifyInvite(signed!, {
      trustedKeys: trusted,
      callerAudience: { kind: "agent", value: "agent_z" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "audience_mismatch");
  });

  await t("open audience accepts any caller", async () => {
    const inv = await signInvite(body(KID, key.pubB64u, { audience: { kind: "open" } }), key.signer);
    const r = await verifyInvite(inv, { trustedKeys: trusted });
    assert.equal(r.ok, true);
  });

  await t("wrong connector rejects with 'connector_mismatch'", async () => {
    const r = await verifyInvite(signed!, {
      trustedKeys: trusted,
      connector: { id: "mcp:gitlab" },
      callerAudience: { kind: "agent", value: "agent_a" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "connector_mismatch");
  });

  await t("attenuation break rejects", async () => {
    const r = await verifyInvite(signed!, {
      trustedKeys: trusted,
      callerAudience: { kind: "agent", value: "agent_a" },
      issuerParentScope: [{ action: "read", resource: "data" }], // missing execute:tool
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "attenuation_break");
  });

  await t("unknown kid rejects with 'issuer_kid_unknown'", async () => {
    const r = await verifyInvite(signed!, {
      trustedKeys: [{ kid: "other", key: key.pubB64u }],
      callerAudience: { kind: "agent", value: "agent_a" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "issuer_kid_unknown");
  });

  await t("kid registered to different key rejects 'issuer_key_mismatch'", async () => {
    const other = makeKey();
    const r = await verifyInvite(signed!, {
      trustedKeys: [{ kid: KID, key: other.pubB64u }],
      callerAudience: { kind: "agent", value: "agent_a" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "issuer_key_mismatch");
  });

  await t("revocation list rejects with 'revoked'", async () => {
    const r = await verifyInvite(signed!, {
      trustedKeys: trusted,
      callerAudience: { kind: "agent", value: "agent_a" },
      revokedInviteIds: new Set([signed!.inviteId]),
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "revoked");
  });

  await t("maxUses exceeded rejects with 'replay_max_uses_exceeded'", async () => {
    const r = await verifyInvite(signed!, {
      trustedKeys: trusted,
      callerAudience: { kind: "agent", value: "agent_a" },
      usageLookup: () => 3,
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "replay_max_uses_exceeded");
  });

  await t("inviteBodyDigest is stable + sha256:<hex>", async () => {
    const d1 = await inviteBodyDigest(inviteBodyOf(signed!));
    const d2 = await inviteBodyDigest(inviteBodyOf(signed!));
    assert.equal(d1, d2);
    assert.match(d1, /^sha256:[0-9a-f]{64}$/);
  });

  console.log(`\n${ran} test(s) passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
