import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";

describe("Phase 9 KYC-lite verification", () => {
  let baseUrl;
  let server;
  let adminToken;
  let applicantToken;
  let requestId;

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
    const signature = keypair
      .sign(Buffer.from(challenge.payload.message, "utf8"))
      .toString("base64");
    const verified = await api("/api/auth/verify", {
      method: "POST",
      body: { publicKey: keypair.publicKey(), nonce: challenge.payload.nonce, signature },
    });
    assert.equal(verified.response.status, 200);
    return verified.payload.sessionId;
  }

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.STORE_DRIVER = "json";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "phase9-api-test-secret";
    process.env.VERCEL = "1";
    delete process.env.BACKEND_SIGNER_SECRET;

    const admin = Keypair.random();
    const applicant = Keypair.random();
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

    [adminToken, applicantToken] = await Promise.all([login(admin), login(applicant)]);
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it("starts donors as UNVERIFIED and blocks NGO-only proof submission", async () => {
    const me = await api("/api/verification/me", { token: applicantToken });
    assert.equal(me.response.status, 200);
    assert.equal(me.payload.data.verificationStatus, "UNVERIFIED");

    const proof = await api("/api/milestones/any-campaign/proof", {
      token: applicantToken,
      method: "POST",
      body: { milestoneIndex: 0, note: "Attempted proof before verification" },
    });
    assert.equal(proof.response.status, 403);
  });

  it("validates and accepts a verification request, rejecting duplicates", async () => {
    const tooShort = await api("/api/verification/request", {
      token: applicantToken,
      method: "POST",
      body: { requestedRole: "NGO", statement: "short" },
    });
    assert.equal(tooShort.response.status, 400);

    const badRole = await api("/api/verification/request", {
      token: applicantToken,
      method: "POST",
      body: { requestedRole: "ADMIN", statement: "I would like admin privileges please." },
    });
    assert.equal(badRole.response.status, 400);

    const created = await api("/api/verification/request", {
      token: applicantToken,
      method: "POST",
      body: {
        requestedRole: "NGO",
        statement: "Fictional relief NGO operating food distribution on testnet.",
        evidenceUrls: ["https://example.test/registration"],
      },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.data.status, "PENDING");
    requestId = created.payload.data.id;

    const duplicate = await api("/api/verification/request", {
      token: applicantToken,
      method: "POST",
      body: {
        requestedRole: "NGO",
        statement: "Second request while the first is still pending review.",
      },
    });
    assert.equal(duplicate.response.status, 400);
  });

  it("restricts the pending queue and review to ADMIN", async () => {
    const denied = await api("/api/verification/pending", { token: applicantToken });
    assert.equal(denied.response.status, 403);

    const reviewDenied = await api(`/api/verification/${requestId}/review`, {
      token: applicantToken,
      method: "POST",
      body: { status: "VERIFIED" },
    });
    assert.equal(reviewDenied.response.status, 403);

    const pending = await api("/api/verification/pending", { token: adminToken });
    assert.equal(pending.response.status, 200);
    assert.ok(pending.payload.data.some((item) => item.id === requestId));
  });

  it("grants the NGO role and VERIFIED status on approval", async () => {
    const reviewed = await api(`/api/verification/${requestId}/review`, {
      token: adminToken,
      method: "POST",
      body: { status: "VERIFIED" },
    });
    assert.equal(reviewed.response.status, 200);
    assert.equal(reviewed.payload.data.status, "VERIFIED");

    const again = await api(`/api/verification/${requestId}/review`, {
      token: adminToken,
      method: "POST",
      body: { status: "REJECTED" },
    });
    assert.equal(again.response.status, 400);

    const me = await api("/api/verification/me", { token: applicantToken });
    assert.equal(me.payload.data.verificationStatus, "VERIFIED");
    assert.ok(me.payload.data.roles.includes("NGO"));

    const session = await api("/api/auth/me", { token: applicantToken });
    assert.ok(session.payload.user.roles.includes("NGO"));
    assert.equal(session.payload.user.verificationStatus, "VERIFIED");
  });
});
