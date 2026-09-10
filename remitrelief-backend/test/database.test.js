import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";

const databaseTestsEnabled =
  process.env.STORE_DRIVER === "prisma" && Boolean(process.env.DATABASE_URL);

describe("PostgreSQL/Prisma persistence", { skip: !databaseTestsEnabled }, () => {
  let prisma;
  let repositories;
  const cleanupWallets = new Set();
  const cleanupOrganizations = new Set();
  const cleanupCampaigns = new Set();

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "phase3-database-test-secret";
    const database = await import("../src/database/prisma.js");
    prisma = database.getPrisma();
    repositories = await import("../src/repositories/index.js");
  });

  after(async () => {
    await prisma.blockchainTransaction.deleteMany({
      where: { campaignId: { in: [...cleanupCampaigns] } },
    });
    await prisma.donation.deleteMany({
      where: { campaignId: { in: [...cleanupCampaigns] } },
    });
    await prisma.campaign.deleteMany({ where: { id: { in: [...cleanupCampaigns] } } });
    await prisma.organization.deleteMany({
      where: { id: { in: [...cleanupOrganizations] } },
    });
    await prisma.user.deleteMany({
      where: { walletAddress: { in: [...cleanupWallets] } },
    });
    await prisma.$disconnect();
  });

  it("persists challenges and stores only hashed session tokens", async () => {
    const { createChallenge, completeLogin, logoutSession } = await import(
      "../src/services/authService.js"
    );
    const { hashSessionToken } = await import("../src/auth/sessionToken.js");
    const keypair = Keypair.random();
    cleanupWallets.add(keypair.publicKey());

    const challenge = await createChallenge({ publicKey: keypair.publicKey() });
    const signature = keypair
      .sign(Buffer.from(challenge.message, "utf8"))
      .toString("base64");
    const result = await completeLogin({
      publicKey: keypair.publicKey(),
      nonce: challenge.nonce,
      signature,
    });

    const persistedSession = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(result.sessionId) },
    });
    const persistedChallenge = await prisma.authChallenge.findUnique({
      where: {
        walletAddress_nonce: {
          walletAddress: keypair.publicKey(),
          nonce: challenge.nonce,
        },
      },
    });

    assert.ok(persistedSession);
    assert.notEqual(persistedSession.tokenHash, result.sessionId);
    assert.ok(persistedChallenge.usedAt);
    await assert.rejects(
      () =>
        completeLogin({
          publicKey: keypair.publicKey(),
          nonce: challenge.nonce,
          signature,
        }),
      (error) => error.code === "CHALLENGE_ALREADY_USED"
    );

    await logoutSession(result.sessionId);
    const revoked = await prisma.session.findUnique({
      where: { id: persistedSession.id },
    });
    assert.ok(revoked.revokedAt);
  });

  it("revokes active sessions when a user is suspended", async () => {
    const keypair = Keypair.random();
    cleanupWallets.add(keypair.publicKey());
    const user = await repositories.usersRepo.upsertFromLogin(keypair.publicKey());
    const rawToken = `phase3-${randomUUID()}`;

    await repositories.sessionsRepo.create({
      id: rawToken,
      userId: user.id,
      walletAddress: keypair.publicKey(),
      roles: ["DONOR"],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await repositories.usersRepo.updateStatus(user.id, "SUSPENDED");

    const session = await repositories.sessionsRepo.find(rawToken);
    assert.equal((await repositories.usersRepo.findById(user.id)).status, "SUSPENDED");
    assert.ok(session.revokedAt);
  });

  it("enforces relationships, uniqueness, and transactional rollback", async () => {
    const keypair = Keypair.random();
    cleanupWallets.add(keypair.publicKey());
    const user = await repositories.usersRepo.upsertFromLogin(keypair.publicKey());
    const suffix = randomUUID();
    const organization = await repositories.organizationsRepo.create({
      name: "Phase 3 Test Organization",
      slug: `phase3-test-${suffix}`,
      status: "VERIFIED",
    });
    cleanupOrganizations.add(organization.id);

    await repositories.organizationsRepo.addMember({
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
    });
    await assert.rejects(
      () =>
        repositories.organizationsRepo.addMember({
          organizationId: organization.id,
          userId: user.id,
          role: "MEMBER",
        }),
      (error) => error.code === "P2002"
    );

    const campaign = await repositories.campaignsRepo.create({
      title: `Phase 4 Database Campaign ${suffix}`,
      location: "Testnet",
      shortDescription: "Database relationship integration test.",
      description: "Fictional campaign used only for relational database testing.",
      category: "COMMUNITY",
      goalAmount: "100",
      currency: "USDC",
      visibility: "PRIVATE",
      deadline: new Date(Date.now() + 86_400_000).toISOString(),
      ownerId: user.id,
      ownerWallet: keypair.publicKey(),
      recipientId: user.id,
      organizationId: organization.id,
      milestones: [
        {
          sequence: 0,
          title: "Delivery",
          description: "Complete fictional delivery.",
          targetAmount: "100",
        },
      ],
    });
    cleanupCampaigns.add(campaign.id);

    assert.equal(
      await prisma.milestone.count({ where: { campaignId: campaign.id } }),
      1
    );
    await assert.rejects(
      () =>
        prisma.milestone.create({
          data: {
            campaignId: campaign.id,
            index: 0,
            label: "Duplicate sequence",
            amount: "1",
          },
        }),
      (error) => error.code === "P2002"
    );
    await assert.rejects(
      () =>
        prisma.campaign.create({
          data: {
            id: `phase4-duplicate-${suffix}`,
            slug: campaign.slug,
            name: "Duplicate slug",
            category: "COMMUNITY",
            goal: "10",
          },
        }),
      (error) => error.code === "P2002"
    );

    await repositories.donationsRepo.create({
      campaignId: campaign.id,
      donor: keypair.publicKey(),
      amount: "25",
      txHash: `phase4-test-${suffix}`,
      status: "CONFIRMED",
      verifiedOnChain: true,
      source: "on_chain",
    });
    const withProgress = await repositories.campaignsRepo.getById(campaign.id);
    assert.equal(withProgress.raisedAmount, "25");
    assert.equal(withProgress.progressPercentage, 25);

    const invalidDonationId = `phase3-invalid-${suffix}`;
    await assert.rejects(
      () =>
        prisma.donation.create({
          data: {
            id: invalidDonationId,
            campaignId: "missing-campaign",
            donorWallet: keypair.publicKey(),
            amount: 1,
          },
        }),
      (error) => error.code === "P2003"
    );
    assert.equal(
      await prisma.donation.count({ where: { id: invalidDonationId } }),
      0
    );
  });

  it("persists queryable audit records", async () => {
    const keypair = Keypair.random();
    cleanupWallets.add(keypair.publicKey());
    const user = await repositories.usersRepo.upsertFromLogin(keypair.publicKey());

    await repositories.auditRepo.create({
      userId: user.id,
      action: "PHASE3_DATABASE_TEST",
      resourceType: "User",
      resourceId: user.id,
      metadata: { source: "integration-test" },
    });

    const records = await repositories.auditRepo.findByUser(user.id);
    assert.ok(records.some((record) => record.action === "PHASE3_DATABASE_TEST"));
  });
});
