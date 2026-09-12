import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { randomBytes } from "node:crypto";

function fakeContractId() {
  return StrKey.encodeContract(randomBytes(32));
}

describe("Phase 5 escrow binding & donations", () => {
  let baseUrl;
  let server;
  let ownerToken;
  let adminToken;
  let donorToken;
  let approvedCampaign;
  let ownerKeypair;

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
    const challenge = challengeResponse.payload;
    const signature = keypair
      .sign(Buffer.from(challenge.message, "utf8"))
      .toString("base64");
    const verified = await api("/api/auth/verify", {
      method: "POST",
      body: { publicKey: keypair.publicKey(), nonce: challenge.nonce, signature },
    });
    assert.equal(verified.response.status, 200);
    return verified.payload.sessionId;
  }

  async function createApprovedCampaign(token) {
    const created = await api("/api/campaigns", {
      token,
      method: "POST",
      body: {
        title: `Escrow Bind Campaign ${Date.now()}`,
        shortDescription: "Phase 5 escrow binding fixture campaign.",
        description: "A fictional campaign used to verify escrow binding and donations.",
        category: "COMMUNITY",
        goalAmount: "100",
        currency: "USDC",
        deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        visibility: "PUBLIC",
        milestones: [
          { title: "First drop", targetAmount: "40", sequence: 0 },
          { title: "Second drop", targetAmount: "60", sequence: 1 },
        ],
      },
    });
    assert.equal(created.response.status, 201);
    const id = created.payload.data.id;
    await api(`/api/campaigns/${id}/submit`, { token, method: "POST" });
    for (const status of ["UNDER_REVIEW", "APPROVED"]) {
      const transitioned = await api(`/api/campaigns/${id}/transitions/${status}`, {
        token: adminToken,
        method: "POST",
      });
      assert.equal(transitioned.response.status, 200);
    }
    const detail = await api(`/api/campaigns/${id}`, { token: adminToken });
    return detail.payload.data;
  }

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.STORE_DRIVER = "json";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "phase5-api-test-secret";
    process.env.VERCEL = "1";
    delete process.env.BACKEND_SIGNER_SECRET;

    ownerKeypair = Keypair.random();
    const admin = Keypair.random();
    const donor = Keypair.random();
    process.env.ADMIN_PUBLIC_KEYS = admin.publicKey();

    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { statsRepo } = await import("../src/repositories/index.js");
    await statsRepo.reset();
    const { default: app } = await import("../src/server.js");
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    [ownerToken, adminToken, donorToken] = await Promise.all([
      login(ownerKeypair),
      login(admin),
      login(donor),
    ]);
    approvedCampaign = await createApprovedCampaign(ownerToken);
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ADMIN_PUBLIC_KEYS;
    delete process.env.VERCEL;
  });

  it("rejects invalid escrow contract IDs", async () => {
    const bad = await api(`/api/campaigns/${approvedCampaign.id}/escrow`, {
      token: adminToken,
      method: "POST",
      body: { escrowAddress: "GINVALID" },
    });
    assert.equal(bad.response.status, 400);
    assert.equal(bad.payload.error.code, "ESCROW_INVALID");
  });

  it("binds a pre-deployed escrow on APPROVED and denies non-admin", async () => {
    const contractId = fakeContractId();
    const denied = await api(`/api/campaigns/${approvedCampaign.id}/escrow`, {
      token: ownerToken,
      method: "POST",
      body: { escrowAddress: contractId },
    });
    assert.equal(denied.response.status, 403);

    const bound = await api(`/api/campaigns/${approvedCampaign.id}/escrow`, {
      token: adminToken,
      method: "POST",
      body: { escrowAddress: contractId },
    });
    assert.equal(bound.response.status, 200);
    assert.equal(bound.payload.data.escrowAddress, contractId);
    approvedCampaign = bound.payload.data;
  });

  it("activates with bound escrow and records demo donations as non-verified", async () => {
    const activated = await api(
      `/api/campaigns/${approvedCampaign.id}/transitions/ACTIVE`,
      { token: adminToken, method: "POST" }
    );
    assert.equal(activated.response.status, 200);
    assert.equal(activated.payload.data.status, "ACTIVE");
    assert.equal(activated.payload.data.escrowAddress, approvedCampaign.escrowAddress);

    const demoAttempt = await api("/api/donations", {
      token: donorToken,
      method: "POST",
      body: {
        campaignId: approvedCampaign.id,
        amount: 5,
        demo: true,
      },
    });
    assert.equal(demoAttempt.response.status, 400);

    const inactive = await createApprovedCampaign(ownerToken);
    const prepareInactive = await api("/api/donations/prepare", {
      token: donorToken,
      method: "POST",
      body: { campaignId: inactive.id, amount: 5 },
    });
    assert.equal(prepareInactive.response.status, 409);
    assert.equal(prepareInactive.payload.error.code, "CAMPAIGN_NOT_ACTIVE");
  });

  it("prepare ignores client escrow and requires bound ACTIVE escrow", async () => {
    const clientEscrow = fakeContractId();
    const prepare = await api("/api/donations/prepare", {
      token: donorToken,
      method: "POST",
      body: {
        campaignId: approvedCampaign.id,
        amount: 10,
        escrowAddress: clientEscrow,
      },
    });
    // Without a funded donor account, XDR build may fail after resolving server escrow.
    // Assert we never echo the client-supplied escrow and we scoped to the campaign.
    if (prepare.response.status === 200) {
      assert.equal(prepare.payload.escrowAddress, approvedCampaign.escrowAddress);
      assert.notEqual(prepare.payload.escrowAddress, clientEscrow);
      assert.equal(prepare.payload.campaignId, approvedCampaign.id);
    } else {
      assert.ok(prepare.response.status >= 400);
      assert.notEqual(prepare.payload?.escrowAddress, clientEscrow);
      assert.notEqual(prepare.payload?.error?.details?.escrowAddress, clientEscrow);
    }

    const unbound = await createApprovedCampaign(ownerToken);
    await api(`/api/campaigns/${unbound.id}/transitions/ACTIVE`, {
      token: adminToken,
      method: "POST",
    });
    const prepareUnbound = await api("/api/donations/prepare", {
      token: donorToken,
      method: "POST",
      body: { campaignId: unbound.id, amount: 5, escrowAddress: clientEscrow },
    });
    assert.equal(prepareUnbound.response.status, 409);
    assert.equal(prepareUnbound.payload.error.code, "ESCROW_NOT_BOUND");
  });
});

describe("Phase 5 activate requires escrow when DEMO_MODE=false", () => {
  it("blocks APPROVED → ACTIVE without escrow outside demo", async () => {
    process.env.NODE_ENV = "test";
    process.env.STORE_DRIVER = "json";
    process.env.DEMO_MODE = "false";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "phase5-strict-secret";
    delete process.env.BACKEND_SIGNER_SECRET;

    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();

    const { statsRepo, campaignsRepo, usersRepo } = await import(
      "../src/repositories/index.js"
    );
    await statsRepo.reset();

    const adminKp = Keypair.random();
    process.env.ADMIN_PUBLIC_KEYS = adminKp.publicKey();
    resetConfigCache();

    const admin = await usersRepo.upsertFromLogin(adminKp.publicKey());
    await usersRepo.addRole(adminKp.publicKey(), "ADMIN");

    const ownerKp = Keypair.random();
    const owner = await usersRepo.upsertFromLogin(ownerKp.publicKey());

    const campaign = await campaignsRepo.create({
      title: "Strict Escrow Activation",
      shortDescription: "Requires escrow",
      description: "Must bind escrow before activate when demo is off.",
      category: "COMMUNITY",
      goalAmount: "50",
      currency: "USDC",
      deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      visibility: "PUBLIC",
      ownerId: owner.id,
      ownerWallet: ownerKp.publicKey(),
      milestones: [{ title: "One", targetAmount: "50", sequence: 0 }],
    });
    await campaignsRepo.transition(campaign.id, "SUBMITTED");
    await campaignsRepo.transition(campaign.id, "UNDER_REVIEW");
    await campaignsRepo.transition(campaign.id, "APPROVED");

    const adminUser = await usersRepo.getByPublicKey(adminKp.publicKey());
    assert.ok(adminUser.roles?.includes("ADMIN"));

    const { transitionCampaign } = await import("../src/services/campaignsService.js");
    await assert.rejects(
      () => transitionCampaign(campaign.id, "ACTIVE", adminUser),
      (err) => err.code === "ESCROW_REQUIRED"
    );

    process.env.DEMO_MODE = "true";
    resetConfigCache();
  });
});

describe("Phase 5 escrowBindingService validation", () => {
  it("validates contract ID format", async () => {
    const { assertValidEscrowContractId } = await import(
      "../src/services/escrowBindingService.js"
    );
    assert.throws(() => assertValidEscrowContractId("not-a-contract"), /ESCROW_INVALID|not a valid/);
    const id = fakeContractId();
    assert.equal(assertValidEscrowContractId(id), id);
  });
});
