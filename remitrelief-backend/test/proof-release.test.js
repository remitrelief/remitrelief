import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { randomBytes } from "node:crypto";

function fakeContractId() {
  return StrKey.encodeContract(randomBytes(32));
}

describe("Phase 6 proof & release engine", () => {
  let baseUrl;
  let server;
  let ownerToken;
  let adminToken;
  let ngoToken;
  let campaign;

  async function api(path, { token, method = "GET", body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = response.status === 204 ? null : await response.json();
    return { response, payload };
  }

  async function login(keypair) {
    const challengeResponse = await api("/api/auth/challenge", {
      method: "POST",
      body: { publicKey: keypair.publicKey() },
    });
    const signature = keypair
      .sign(Buffer.from(challengeResponse.payload.message, "utf8"))
      .toString("base64");
    const verified = await api("/api/auth/verify", {
      method: "POST",
      body: {
        publicKey: keypair.publicKey(),
        nonce: challengeResponse.payload.nonce,
        signature,
      },
    });
    assert.equal(verified.response.status, 200);
    return verified.payload.sessionId;
  }

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.STORE_DRIVER = "json";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "phase6-api-test-secret";
    process.env.VERCEL = "1";
    delete process.env.BACKEND_SIGNER_SECRET;

    const owner = Keypair.random();
    const admin = Keypair.random();
    const ngo = Keypair.random();
    process.env.ADMIN_PUBLIC_KEYS = admin.publicKey();
    process.env.NGO_PUBLIC_KEYS = ngo.publicKey();

    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { statsRepo } = await import("../src/repositories/index.js");
    await statsRepo.reset();
    const { default: app } = await import("../src/server.js");
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    [ownerToken, adminToken, ngoToken] = await Promise.all([
      login(owner),
      login(admin),
      login(ngo),
    ]);

    const created = await api("/api/campaigns", {
      token: ownerToken,
      method: "POST",
      body: {
        title: `Proof Release Campaign ${Date.now()}`,
        shortDescription: "Phase 6 proof and release fixture.",
        description: "Fictional campaign for proof submission and milestone verify/release.",
        category: "COMMUNITY",
        goalAmount: "100",
        currency: "USDC",
        deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        visibility: "PUBLIC",
        milestones: [
          { title: "Kits staged", targetAmount: "40", sequence: 0 },
          { title: "Kits delivered", targetAmount: "60", sequence: 1 },
        ],
      },
    });
    assert.equal(created.response.status, 201);
    campaign = created.payload.data;
    await api(`/api/campaigns/${campaign.id}/submit`, { token: ownerToken, method: "POST" });
    for (const status of ["UNDER_REVIEW", "APPROVED"]) {
      const step = await api(`/api/campaigns/${campaign.id}/transitions/${status}`, {
        token: adminToken,
        method: "POST",
      });
      assert.equal(step.response.status, 200);
    }
    const bound = await api(`/api/campaigns/${campaign.id}/escrow`, {
      token: adminToken,
      method: "POST",
      body: { escrowAddress: fakeContractId() },
    });
    assert.equal(bound.response.status, 200);
    const activated = await api(`/api/campaigns/${campaign.id}/transitions/ACTIVE`, {
      token: adminToken,
      method: "POST",
    });
    assert.equal(activated.response.status, 200);
    campaign = activated.payload.data;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ADMIN_PUBLIC_KEYS;
    delete process.env.NGO_PUBLIC_KEYS;
    delete process.env.VERCEL;
  });

  it("requires proof before verify and rejects short notes", async () => {
    const blocked = await api(`/api/milestones/${campaign.id}/verify`, {
      token: ngoToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, demo: true },
    });
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.payload.error.code, "PROOF_REQUIRED");

    const short = await api(`/api/milestones/${campaign.id}/proof`, {
      token: ngoToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, note: "too short" },
    });
    assert.equal(short.response.status, 400);
    assert.equal(short.payload.error.code, "PROOF_INVALID");
  });

  it("submits proof then verifies without auto-release", async () => {
    // Demo verify requires unbound escrow in this phase
    const { campaignsRepo } = await import("../src/repositories/index.js");
    await campaignsRepo.setEscrowBinding(campaign.id, { escrowAddress: null });

    const proof = await api(`/api/milestones/${campaign.id}/proof`, {
      token: ngoToken,
      method: "POST",
      body: {
        campaignId: campaign.id,
        milestoneIndex: 0,
        note: "Forty emergency kits staged at the community warehouse with photo evidence.",
        evidenceUrls: ["https://example.test/proof-kit-photo.jpg"],
      },
    });
    assert.equal(proof.response.status, 201);
    assert.equal(proof.payload.milestoneIndex, 0);

    const listed = await api(`/api/milestones/${campaign.id}/proofs`);
    assert.equal(listed.response.status, 200);
    assert.ok(listed.payload.some((item) => item.id === proof.payload.id));

    const verified = await api(`/api/milestones/${campaign.id}/verify`, {
      token: ngoToken,
      method: "POST",
      body: {
        campaignId: campaign.id,
        milestoneIndex: 0,
        demo: true,
        autoRelease: false,
      },
    });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.payload.verified, true);
    assert.equal(verified.payload.release, null);

    const again = await api(`/api/milestones/${campaign.id}/verify`, {
      token: ngoToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, demo: true },
    });
    assert.equal(again.response.status, 409);
    assert.equal(again.payload.error.code, "MILESTONE_ALREADY_VERIFIED");
  });

  it("allows admin release after verify and blocks double release", async () => {
    const released = await api(`/api/milestones/${campaign.id}/release`, {
      token: adminToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, demo: true },
    });
    assert.equal(released.response.status, 200);
    assert.equal(released.payload.released, true);

    const dup = await api(`/api/milestones/${campaign.id}/release`, {
      token: adminToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, demo: true },
    });
    assert.equal(dup.response.status, 409);
    assert.equal(dup.payload.error.code, "MILESTONE_ALREADY_RELEASED");
  });
});
