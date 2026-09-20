import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";

describe("Phase 7 operator workspaces & transparency", () => {
  let baseUrl;
  let server;
  let ownerToken;
  let adminToken;
  let donorToken;
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
    process.env.AUTH_SESSION_SECRET = "phase7-api-test-secret";
    process.env.VERCEL = "1";
    delete process.env.BACKEND_SIGNER_SECRET;

    const owner = Keypair.random();
    const admin = Keypair.random();
    const donor = Keypair.random();
    process.env.ADMIN_PUBLIC_KEYS = admin.publicKey();
    delete process.env.NGO_PUBLIC_KEYS;

    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { statsRepo } = await import("../src/repositories/index.js");
    await statsRepo.reset();
    const { default: app } = await import("../src/server.js");
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    [ownerToken, adminToken, donorToken] = await Promise.all([
      login(owner),
      login(admin),
      login(donor),
    ]);

    const created = await api("/api/campaigns", {
      token: ownerToken,
      method: "POST",
      body: {
        title: `Operator Queue Campaign ${Date.now()}`,
        shortDescription: "Phase 7 moderation queue fixture.",
        description: "Fictional campaign awaiting operator review for Phase 7 tests.",
        category: "COMMUNITY",
        goalAmount: "50",
        currency: "USDC",
        deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        visibility: "PUBLIC",
        milestones: [{ title: "First tranche", targetAmount: "50", sequence: 0 }],
      },
    });
    assert.equal(created.response.status, 201);
    campaign = created.payload.data;
    const submitted = await api(`/api/campaigns/${campaign.id}/submit`, {
      token: ownerToken,
      method: "POST",
    });
    assert.equal(submitted.response.status, 200);
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it("rejects non-admin moderation queue access", async () => {
    const denied = await api("/api/campaigns/admin/queue", { token: donorToken });
    assert.equal(denied.response.status, 403);
  });

  it("lists submitted campaigns in the admin moderation queue", async () => {
    const queue = await api("/api/campaigns/admin/queue", { token: adminToken });
    assert.equal(queue.response.status, 200);
    assert.ok(Array.isArray(queue.payload.data));
    assert.ok(queue.payload.data.some((item) => item.id === campaign.id));
  });

  it("creates an organization as PENDING and allows admin verification", async () => {
    const created = await api("/api/organizations", {
      token: ownerToken,
      method: "POST",
      body: {
        name: `Relief Partners ${Date.now()}`,
        description: "Status-only organization for Phase 7 — not KYC.",
      },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.data.status, "PENDING");

    const mine = await api("/api/organizations/mine", { token: ownerToken });
    assert.equal(mine.response.status, 200);
    assert.ok(mine.payload.data.some((org) => org.id === created.payload.data.id));

    const pendingDenied = await api("/api/organizations/pending", { token: ownerToken });
    assert.equal(pendingDenied.response.status, 403);

    const pending = await api("/api/organizations/pending", { token: adminToken });
    assert.equal(pending.response.status, 200);
    assert.ok(pending.payload.data.some((org) => org.id === created.payload.data.id));

    const verified = await api(`/api/organizations/${created.payload.data.id}/status`, {
      token: adminToken,
      method: "POST",
      body: { status: "VERIFIED" },
    });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.payload.data.status, "VERIFIED");
  });

  it("exposes admin audit feed and indexer status", async () => {
    const audits = await api("/api/admin/audits?limit=20", { token: adminToken });
    assert.equal(audits.response.status, 200);
    assert.ok(Array.isArray(audits.payload.data));
    assert.ok(audits.payload.data.some((row) => row.action === "ORG_CREATED" || row.action === "ORG_STATUS_UPDATED"));

    const indexer = await api("/api/admin/indexer", { token: adminToken });
    assert.equal(indexer.response.status, 200);
    assert.equal(typeof indexer.payload.data.escrowCampaigns, "number");
  });

  it("filters ledger events by campaignId", async () => {
    const ledger = await api(`/api/ledger?campaignId=${campaign.id}&limit=20`);
    assert.equal(ledger.response.status, 200);
    assert.ok(Array.isArray(ledger.payload));
    assert.ok(ledger.payload.every((event) => event.campaignId === campaign.id));
  });
});
