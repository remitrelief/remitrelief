import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";

describe("Phase 4 campaign API", () => {
  let baseUrl;
  let server;
  let ownerToken;
  let otherToken;
  let adminToken;
  let campaign;
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

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.STORE_DRIVER = "json";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "phase4-api-test-secret";
    process.env.VERCEL = "1";
    const owner = Keypair.random();
    ownerKeypair = owner;
    const other = Keypair.random();
    const admin = Keypair.random();
    process.env.ADMIN_PUBLIC_KEYS = admin.publicKey();

    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { statsRepo } = await import("../src/repositories/index.js");
    await statsRepo.reset();
    const { default: app } = await import("../src/server.js");
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    [ownerToken, otherToken, adminToken] = await Promise.all([
      login(owner),
      login(other),
      login(admin),
    ]);
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ADMIN_PUBLIC_KEYS;
    delete process.env.VERCEL;
  });

  it("creates, edits, and protects a private draft from IDOR", async () => {
    const created = await api("/api/campaigns", {
      token: ownerToken,
      method: "POST",
      body: {
        title: "Fictional Community Food Support",
        shortDescription: "Nutritious food support for a fictional community.",
        description:
          "This fictional campaign supports a local community food program during a temporary emergency.",
        category: "FOOD",
        goalAmount: "1000",
        currency: "USDC",
        deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        visibility: "PRIVATE",
      },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.data.status, "DRAFT");
    campaign = created.payload.data;

    const denied = await api(`/api/campaigns/${campaign.id}`, {
      token: otherToken,
      method: "PATCH",
      body: { title: "Unauthorized title change" },
    });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.payload.error.code, "CAMPAIGN_ACCESS_DENIED");

    const hidden = await api(`/api/campaigns/${campaign.id}`);
    assert.equal(hidden.response.status, 404);

    const edited = await api(`/api/campaigns/${campaign.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: { visibility: "PUBLIC", location: "Test Community" },
    });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.payload.data.location, "Test Community");

    const { organizationsRepo, usersRepo } = await import("../src/repositories/index.js");
    const owner = await usersRepo.getByPublicKey(ownerKeypair.publicKey());
    const organization = await organizationsRepo.create({
      name: "Fictional Food Cooperative",
      slug: `food-cooperative-${Date.now()}`,
    });
    await organizationsRepo.addMember({
      organizationId: organization.id,
      userId: owner.id,
      role: "OWNER",
    });
    const associated = await api(`/api/campaigns/${campaign.id}`, {
      token: ownerToken,
      method: "PATCH",
      body: { organizationId: organization.id },
    });
    assert.equal(associated.response.status, 200);
    assert.equal(associated.payload.data.organizationId, organization.id);
    campaign = associated.payload.data;
  });

  it("manages milestones, media, submission, and admin-only lifecycle", async () => {
    for (const milestone of [
      { title: "Purchase food supplies", targetAmount: "400", sequence: 0 },
      { title: "Distribute food supplies", targetAmount: "600", sequence: 1 },
    ]) {
      const created = await api(`/api/campaigns/${campaign.id}/milestones`, {
        token: ownerToken,
        method: "POST",
        body: milestone,
      });
      assert.equal(created.response.status, 201);
    }

    const media = await api(`/api/campaigns/${campaign.id}/media`, {
      token: ownerToken,
      method: "POST",
      body: {
        url: "https://images.example.test/food-support.jpg",
        type: "IMAGE",
        altText: "Fictional food parcels",
        isCover: true,
      },
    });
    assert.equal(media.response.status, 201);

    const submitted = await api(`/api/campaigns/${campaign.id}/submit`, {
      token: ownerToken,
      method: "POST",
    });
    assert.equal(submitted.response.status, 200);
    assert.equal(submitted.payload.data.status, "SUBMITTED");

    const ownerCannotApprove = await api(
      `/api/campaigns/${campaign.id}/transitions/APPROVED`,
      { token: ownerToken, method: "POST" }
    );
    assert.equal(ownerCannotApprove.response.status, 403);

    for (const status of ["UNDER_REVIEW", "APPROVED", "ACTIVE"]) {
      const transitioned = await api(
        `/api/campaigns/${campaign.id}/transitions/${status}`,
        { token: adminToken, method: "POST" }
      );
      assert.equal(transitioned.response.status, 200);
      assert.equal(transitioned.payload.data.status, status);
    }
  });

  it("publishes updates and supports public discovery, search, filters and pagination", async () => {
    const update = await api(`/api/campaigns/${campaign.id}/updates`, {
      token: ownerToken,
      method: "POST",
      body: {
        title: "Food supplies prepared",
        content: "The first fictional batch of food supplies has been prepared for distribution.",
        publish: true,
      },
    });
    assert.equal(update.response.status, 201);
    assert.equal(update.payload.data.status, "PUBLISHED");

    const listing = await api(
      "/api/campaigns?search=food&category=FOOD&sort=ending_soon&page=1&limit=5"
    );
    assert.equal(listing.response.status, 200);
    assert.equal(listing.payload.meta.page, 1);
    assert.ok(listing.payload.data.some((item) => item.id === campaign.id));

    const detail = await api(`/api/campaigns/${campaign.slug}`);
    assert.equal(detail.response.status, 200);
    assert.equal(detail.payload.data.updates[0].title, "Food supplies prepared");
    assert.equal(detail.payload.data.raisedAmount, "0");
  });

  it("allows deletion only for donation-free drafts", async () => {
    const created = await api("/api/campaigns", {
      token: ownerToken,
      method: "POST",
      body: {
        title: "Temporary Fictional Draft",
        category: "COMMUNITY",
        goalAmount: "10",
        currency: "USD",
        visibility: "PRIVATE",
      },
    });
    const removed = await api(`/api/campaigns/${created.payload.data.id}`, {
      token: ownerToken,
      method: "DELETE",
    });
    assert.equal(removed.response.status, 204);
  });
});
