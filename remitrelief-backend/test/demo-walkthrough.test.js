import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { signChallengeMessage } from "./helpers/signing.js";

/**
 * Phase 10 end-to-end TESTNET demo walkthrough (DEMO_MODE, no escrow, no chain calls):
 * NGO applies → admin verifies → campaign created/approved/activated → donor donates →
 * NGO submits proof → verify → admin release → public ledger shows it.
 * Then suspension: suspended NGO is blocked until reinstated.
 */
describe("Phase 10 demo walkthrough", () => {
  let baseUrl;
  let server;
  let adminKey;
  let ngoKey;
  let adminToken;
  let ngoToken;
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
    const challenge = await api("/api/auth/challenge", {
      method: "POST",
      body: { publicKey: keypair.publicKey() },
    });
    const signature = signChallengeMessage(keypair, challenge.payload.message);
    const verified = await api("/api/auth/verify", {
      method: "POST",
      body: { publicKey: keypair.publicKey(), nonce: challenge.payload.nonce, signature },
    });
    assert.equal(verified.response.status, 200);
    return verified.payload.sessionId;
  }

  function submitProof(milestoneIndex, token = ngoToken) {
    return api(`/api/milestones/${campaign.id}/proof`, {
      token,
      method: "POST",
      body: {
        campaignId: campaign.id,
        milestoneIndex,
        note: "Relief kits delivered to the shelter; photo log and signed receipt attached.",
        evidenceUrls: ["https://example.test/receipt.jpg"],
      },
    });
  }

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.STORE_DRIVER = "json";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "phase10-walkthrough-secret";
    process.env.VERCEL = "1";
    delete process.env.BACKEND_SIGNER_SECRET;

    adminKey = Keypair.random();
    ngoKey = Keypair.random();
    const donorKey = Keypair.random();
    process.env.ADMIN_PUBLIC_KEYS = adminKey.publicKey();
    delete process.env.NGO_PUBLIC_KEYS;
    delete process.env.RECIPIENT_PUBLIC_KEYS;

    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { statsRepo } = await import("../src/repositories/index.js");
    await statsRepo.reset();
    const { default: app } = await import("../src/server.js");
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    [adminToken, ngoToken, donorToken] = await Promise.all([
      login(adminKey),
      login(ngoKey),
      login(donorKey),
    ]);
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    delete process.env.ADMIN_PUBLIC_KEYS;
    delete process.env.VERCEL;
  });

  it("verifies a new NGO through the KYC-lite queue", async () => {
    const applied = await api("/api/verification/request", {
      token: ngoToken,
      method: "POST",
      body: {
        requestedRole: "NGO",
        statement: "Community shelter network distributing relief kits (testnet demo).",
      },
    });
    assert.equal(applied.response.status, 201);

    const reviewed = await api(`/api/verification/${applied.payload.data.id}/review`, {
      token: adminToken,
      method: "POST",
      body: { status: "VERIFIED" },
    });
    assert.equal(reviewed.response.status, 200);
  });

  it("creates, approves, and activates a campaign in demo mode", async () => {
    const created = await api("/api/campaigns", {
      token: ngoToken,
      method: "POST",
      body: {
        title: `Walkthrough Shelter Kits ${Date.now()}`,
        shortDescription: "End-to-end demo walkthrough campaign.",
        description: "Fictional testnet campaign exercising the full donation and release flow.",
        category: "COMMUNITY",
        goalAmount: "100",
        currency: "USDC",
        deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        visibility: "PUBLIC",
        milestones: [
          { title: "Kits purchased", targetAmount: "40", sequence: 0 },
          { title: "Kits delivered", targetAmount: "60", sequence: 1 },
        ],
      },
    });
    assert.equal(created.response.status, 201);
    campaign = created.payload.data;

    const submitted = await api(`/api/campaigns/${campaign.id}/submit`, {
      token: ngoToken,
      method: "POST",
    });
    assert.equal(submitted.response.status, 200);

    for (const status of ["UNDER_REVIEW", "APPROVED", "ACTIVE"]) {
      const step = await api(`/api/campaigns/${campaign.id}/transitions/${status}`, {
        token: adminToken,
        method: "POST",
      });
      assert.equal(step.response.status, 200, `transition to ${status}`);
      campaign = step.payload.data;
    }
    assert.equal(campaign.status, "ACTIVE");
  });

  it("records a donor's demo donation", async () => {
    const donated = await api("/api/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: campaign.id, amount: 25, demo: true },
    });
    assert.equal(donated.response.status, 201);
    assert.equal(donated.payload.verifiedOnChain, false);

    const mine = await api(`/api/donations?campaignId=${campaign.id}`, { token: donorToken });
    assert.equal(mine.response.status, 200);
    assert.ok(mine.payload.length >= 1);
  });

  it("submits proof, verifies, and releases milestone 0", async () => {
    const proof = await submitProof(0);
    assert.equal(proof.response.status, 201);

    const verified = await api(`/api/milestones/${campaign.id}/verify`, {
      token: ngoToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, demo: true, autoRelease: false },
    });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.payload.verified, true);

    const released = await api(`/api/milestones/${campaign.id}/release`, {
      token: adminToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, demo: true },
    });
    assert.equal(released.response.status, 200);
    assert.equal(released.payload.released, true);

    const ledger = await api(`/api/ledger?campaignId=${campaign.id}`);
    assert.equal(ledger.response.status, 200);
    const types = new Set(ledger.payload.data.map((event) => event.type));
    assert.ok(types.has("verify"), "ledger shows verify");
    assert.ok(types.has("release"), "ledger shows release");
    assert.ok(
      ledger.payload.data.every((event) => event.eventTrust === "demo_or_application"),
      "demo events are never labelled on-chain verified"
    );
  });

  it("blocks a suspended NGO until an admin reinstates them", async () => {
    const wallet = ngoKey.publicKey();

    const nonAdmin = await api(`/api/verification/users/${wallet}/status`, {
      token: ngoToken,
      method: "POST",
      body: { status: "SUSPENDED" },
    });
    assert.equal(nonAdmin.response.status, 403);

    const suspended = await api(`/api/verification/users/${wallet}/status`, {
      token: adminToken,
      method: "POST",
      body: { status: "SUSPENDED", reason: "Evidence under review" },
    });
    assert.equal(suspended.response.status, 200);
    assert.equal(suspended.payload.data.verificationStatus, "SUSPENDED");

    const blockedProof = await submitProof(1);
    assert.equal(blockedProof.response.status, 403);
    assert.equal(blockedProof.payload.error.code, "VERIFICATION_REQUIRED");

    const reapply = await api("/api/verification/request", {
      token: ngoToken,
      method: "POST",
      body: { requestedRole: "RECIPIENT", statement: "Trying to clear the suspension by reapplying." },
    });
    assert.equal(reapply.response.status, 403, "suspended users cannot self-clear by reapplying");

    const reinstated = await api(`/api/verification/users/${wallet}/status`, {
      token: adminToken,
      method: "POST",
      body: { status: "VERIFIED" },
    });
    assert.equal(reinstated.response.status, 200);

    const proof = await submitProof(1);
    assert.equal(proof.response.status, 201);
  });

  it("keeps a verified NGO verified while a second-role request is pending", async () => {
    const applied = await api("/api/verification/request", {
      token: ngoToken,
      method: "POST",
      body: {
        requestedRole: "RECIPIENT",
        statement: "Also receiving direct aid for the shelter's own residents.",
      },
    });
    assert.equal(applied.response.status, 201);

    const me = await api("/api/verification/me", { token: ngoToken });
    assert.equal(me.payload.data.verificationStatus, "VERIFIED");

    const rejected = await api(`/api/verification/${applied.payload.data.id}/review`, {
      token: adminToken,
      method: "POST",
      body: { status: "REJECTED", reviewNote: "Recipient role not needed" },
    });
    assert.equal(rejected.response.status, 200);

    const after = await api("/api/verification/me", { token: ngoToken });
    assert.equal(after.payload.data.verificationStatus, "VERIFIED");
    assert.ok(!after.payload.data.roles.includes("RECIPIENT"));
  });

  it("rejects admin self-changes, unknown wallets, bad statuses, and oversized statements", async () => {
    const self = await api(`/api/verification/users/${adminKey.publicKey()}/status`, {
      token: adminToken,
      method: "POST",
      body: { status: "SUSPENDED" },
    });
    assert.equal(self.response.status, 403);

    const unknown = await api(`/api/verification/users/${Keypair.random().publicKey()}/status`, {
      token: adminToken,
      method: "POST",
      body: { status: "SUSPENDED" },
    });
    assert.equal(unknown.response.status, 404);

    const badStatus = await api(`/api/verification/users/${ngoKey.publicKey()}/status`, {
      token: adminToken,
      method: "POST",
      body: { status: "PENDING" },
    });
    assert.equal(badStatus.response.status, 400);

    const tooLong = await api("/api/verification/request", {
      token: donorToken,
      method: "POST",
      body: { requestedRole: "NGO", statement: "x".repeat(2001) },
    });
    assert.equal(tooLong.response.status, 400);
  });
});
