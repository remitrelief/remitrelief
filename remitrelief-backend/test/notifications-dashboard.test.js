import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { signChallengeMessage } from "./helpers/signing.js";

describe("Phase 11 notifications & dashboards", () => {
  let baseUrl;
  let server;
  let adminToken;
  let ngoToken;
  let donorToken;
  let recipientToken;
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

  async function notificationsFor(token) {
    const result = await api("/api/notifications?limit=50", { token });
    assert.equal(result.response.status, 200);
    return result.payload.data;
  }

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.STORE_DRIVER = "json";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "phase11-api-test-secret";
    process.env.VERCEL = "1";
    delete process.env.BACKEND_SIGNER_SECRET;

    const admin = Keypair.random();
    const ngo = Keypair.random();
    const donor = Keypair.random();
    const recipient = Keypair.random();
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

    [adminToken, ngoToken, donorToken, recipientToken] = await Promise.all([
      login(admin),
      login(ngo),
      login(donor),
      login(recipient),
    ]);
    const recipientMe = await api("/api/auth/me", { token: recipientToken });
    const recipientId = recipientMe.payload.user.id;

    const created = await api("/api/campaigns", {
      token: ngoToken,
      method: "POST",
      body: {
        title: `Notify Campaign ${Date.now()}`,
        shortDescription: "Phase 11 notifications fixture.",
        description: "Fictional testnet campaign for notification and dashboard coverage.",
        category: "COMMUNITY",
        goalAmount: "100",
        currency: "USDC",
        deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        visibility: "PUBLIC",
        recipientId,
        milestones: [
          { title: "Water tanks bought", targetAmount: "40", sequence: 0 },
          { title: "Water tanks installed", targetAmount: "60", sequence: 1 },
        ],
      },
    });
    assert.equal(created.response.status, 201);
    campaign = created.payload.data;
    await api(`/api/campaigns/${campaign.id}/submit`, { token: ngoToken, method: "POST" });
    for (const status of ["UNDER_REVIEW", "APPROVED", "ACTIVE"]) {
      const step = await api(`/api/campaigns/${campaign.id}/transitions/${status}`, {
        token: adminToken,
        method: "POST",
      });
      assert.equal(step.response.status, 200);
    }
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    delete process.env.ADMIN_PUBLIC_KEYS;
    delete process.env.NGO_PUBLIC_KEYS;
    delete process.env.VERCEL;
  });

  it("requires authentication", async () => {
    const list = await api("/api/notifications");
    assert.equal(list.response.status, 401);
    const dashboard = await api("/api/dashboard/me");
    assert.equal(dashboard.response.status, 401);
  });

  it("notifies the owner of campaign status changes and donations", async () => {
    const donated = await api("/api/donations", {
      token: donorToken,
      method: "POST",
      body: { campaignId: campaign.id, amount: 25, demo: true },
    });
    assert.equal(donated.response.status, 201);

    const { items } = await notificationsFor(ngoToken);
    const types = items.map((item) => item.type);
    assert.equal(types.filter((type) => type === "CAMPAIGN_STATUS_CHANGED").length, 3);
    const donation = items.find((item) => item.type === "DONATION_RECEIVED");
    assert.ok(donation, "owner is told about the donation");
    assert.match(donation.body, /demo, not on-chain/);
    assert.equal(donation.link, `/dashboard/campaigns/${campaign.id}`);
  });

  it("refuses to release a milestone that was never verified, even in demo mode", async () => {
    const released = await api(`/api/milestones/${campaign.id}/release`, {
      token: adminToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, demo: true },
    });
    assert.equal(released.response.status, 400);
    assert.equal(released.payload.error.code, "MILESTONE_NOT_VERIFIED");
  });

  it("notifies owner on verify and donors on release, with the milestone amount", async () => {
    const proof = await api(`/api/milestones/${campaign.id}/proof`, {
      token: ngoToken,
      method: "POST",
      body: {
        campaignId: campaign.id,
        milestoneIndex: 0,
        note: "Four water tanks purchased; receipts and photos attached.",
      },
    });
    assert.equal(proof.response.status, 201);

    const verified = await api(`/api/milestones/${campaign.id}/verify`, {
      token: adminToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, demo: true },
    });
    assert.equal(verified.response.status, 200);

    const released = await api(`/api/milestones/${campaign.id}/release`, {
      token: adminToken,
      method: "POST",
      body: { campaignId: campaign.id, milestoneIndex: 0, demo: true },
    });
    assert.equal(released.response.status, 200);
    assert.equal(released.payload.event.amount, 40, "release defaults to milestone target");

    const ngoItems = (await notificationsFor(ngoToken)).items;
    assert.ok(ngoItems.some((item) => item.type === "MILESTONE_VERIFIED"));
    assert.ok(
      !ngoItems.some((item) => item.type === "PROOF_SUBMITTED"),
      "the owner is not notified about their own proof"
    );

    const donorItems = (await notificationsFor(donorToken)).items;
    const release = donorItems.find((item) => item.type === "MILESTONE_RELEASED");
    assert.ok(release, "donor hears about the release");
    assert.match(release.title, /Water tanks bought/);
    assert.match(release.body, /40 USDC/);

    const recipientItems = (await notificationsFor(recipientToken)).items;
    assert.ok(
      recipientItems.some((item) => item.type === "MILESTONE_RELEASED"),
      "the named recipient hears about the release"
    );
  });

  it("marks notifications read and scopes them to their owner", async () => {
    const { items, unreadCount } = await notificationsFor(donorToken);
    assert.ok(unreadCount >= 1);
    const target = items[0];

    const foreign = await api(`/api/notifications/${target.id}/read`, {
      token: ngoToken,
      method: "POST",
    });
    assert.equal(foreign.response.status, 404, "users cannot touch other users' notifications");

    const read = await api(`/api/notifications/${target.id}/read`, {
      token: donorToken,
      method: "POST",
    });
    assert.equal(read.response.status, 200);
    assert.ok(read.payload.data.readAt);

    await api("/api/notifications/read-all", { token: donorToken, method: "POST" });
    const count = await api("/api/notifications/unread-count", { token: donorToken });
    assert.equal(count.payload.data.unreadCount, 0);

    const unreadOnly = await api("/api/notifications?unread=true", { token: donorToken });
    assert.equal(unreadOnly.payload.data.items.length, 0);
  });

  it("summarizes donor, organizer, and recipient dashboards", async () => {
    const donorView = await api("/api/dashboard/me", { token: donorToken });
    assert.equal(donorView.response.status, 200);
    const { donor, organizer } = donorView.payload.data;
    assert.equal(donor.totalGiven, 25);
    assert.equal(donor.totalGivenOnChain, 0);
    assert.equal(donor.campaignsSupported, 1);
    assert.equal(donor.releasedOnSupported, 40);
    assert.equal(donor.recentDonations[0].campaignId, campaign.id);
    assert.equal(organizer, null, "plain donors get no organizer section");

    const ngoView = await api("/api/dashboard/me", { token: ngoToken });
    const ngoOrganizer = ngoView.payload.data.organizer;
    assert.equal(ngoOrganizer.campaignCount, 1);
    assert.equal(ngoOrganizer.byStatus.ACTIVE, 1);
    assert.equal(ngoOrganizer.totalReleased, 40);
    assert.equal(ngoOrganizer.milestonesVerified, 1);
    assert.equal(ngoOrganizer.needsAttention[0].nextAction, "Submit proof for milestone 2");
    assert.equal(ngoView.payload.data.recipient, null, "owner is not listed as their own recipient");

    const recipientView = await api("/api/dashboard/me", { token: recipientToken });
    const { recipient } = recipientView.payload.data;
    assert.equal(recipient.campaignCount, 1);
    assert.equal(recipient.totalReleased, 40);
    assert.equal(recipient.campaigns[0].id, campaign.id);
  });

  it("includes released funds in public impact stats", async () => {
    const stats = await api("/api/ledger/stats");
    assert.equal(stats.response.status, 200);
    assert.ok(Number(stats.payload.amountReleased) >= 40);
  });
});
