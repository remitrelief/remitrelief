import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";

describe("config + demo mode gating", () => {
  const original = { ...process.env };

  after(() => {
    Object.keys(process.env).forEach((k) => {
      if (!(k in original)) delete process.env[k];
    });
    Object.assign(process.env, original);
  });

  it("defaults DEMO_MODE on in development", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.DEMO_MODE;
    process.env.STELLAR_NETWORK = "TESTNET";
    const { resetConfigCache, loadConfig } = await import("../src/config.js");
    resetConfigCache();
    const cfg = loadConfig({ fresh: true });
    assert.equal(cfg.demoMode, true);
  });

  it("forces demoMode false in production even if DEMO_MODE=true", async () => {
    process.env.NODE_ENV = "production";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.CORS_ORIGINS = "https://example.com";
    process.env.AUTH_SESSION_SECRET = "prod-secret-for-tests";
    process.env.STORE_DRIVER = "prisma";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    const { resetConfigCache, loadConfig, assertDemoModeAllowed } = await import("../src/config.js");
    resetConfigCache();
    const cfg = loadConfig({ fresh: true });
    assert.equal(cfg.demoMode, false);
    assert.throws(() => assertDemoModeAllowed(), /Demo financial mutations are disabled/);
  });

  it("rejects mainnet network", async () => {
    process.env.NODE_ENV = "development";
    process.env.STELLAR_NETWORK = "MAINNET";
    const { resetConfigCache, loadConfig } = await import("../src/config.js");
    resetConfigCache();
    assert.throws(() => loadConfig({ fresh: true }), /UNSUPPORTED_NETWORK/);
  });

  it("requires CORS_ORIGINS in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "prod-secret-for-tests";
    process.env.STORE_DRIVER = "prisma";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    delete process.env.CORS_ORIGINS;
    const { resetConfigCache, loadConfig } = await import("../src/config.js");
    resetConfigCache();
    assert.throws(() => loadConfig({ fresh: true }), /CORS_ORIGINS/);
  });
});

describe("wallet auth challenge + sessions", () => {
  before(() => {
    process.env.NODE_ENV = "development";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "test-auth-secret";
    process.env.ALLOW_STORE_RESET = "true";
  });

  it("issues session for a valid signed challenge", async () => {
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { createChallenge, completeLogin, resolveSession } = await import(
      "../src/services/authService.js"
    );
    const kp = Keypair.random();
    const challenge = await createChallenge({ publicKey: kp.publicKey() });
    assert.match(challenge.message, /RemitRelief Authentication/);
    assert.match(challenge.message, /TESTNET/);
    assert.ok(challenge.issuedAt);
    assert.ok(challenge.expiresAt);
    const signature = kp.sign(Buffer.from(challenge.message, "utf8")).toString("base64");
    const result = await completeLogin({
      publicKey: kp.publicKey(),
      nonce: challenge.nonce,
      signature,
    });
    assert.ok(result.sessionId);
    assert.ok(result.user.roles.includes("DONOR"));
    const ctx = await resolveSession(result.sessionId);
    assert.equal(ctx.walletAddress, kp.publicKey());
  });

  it("rejects bad signatures", async () => {
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { createChallenge, completeLogin } = await import("../src/services/authService.js");
    const kp = Keypair.random();
    const other = Keypair.random();
    const challenge = await createChallenge({ publicKey: kp.publicKey() });
    const signature = other.sign(Buffer.from(challenge.message, "utf8")).toString("base64");
    await assert.rejects(
      () =>
        completeLogin({
          publicKey: kp.publicKey(),
          nonce: challenge.nonce,
          signature,
        }),
      (err) => err.code === "INVALID_SIGNATURE"
    );
  });

  it("rejects reused challenges", async () => {
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { createChallenge, completeLogin } = await import("../src/services/authService.js");
    const kp = Keypair.random();
    const challenge = await createChallenge({ publicKey: kp.publicKey() });
    const signature = kp.sign(Buffer.from(challenge.message, "utf8")).toString("base64");
    await completeLogin({
      publicKey: kp.publicKey(),
      nonce: challenge.nonce,
      signature,
    });
    await assert.rejects(
      () =>
        completeLogin({
          publicKey: kp.publicKey(),
          nonce: challenge.nonce,
          signature,
        }),
      (err) =>
        err.code === "INVALID_CHALLENGE" ||
        err.code === "CHALLENGE_ALREADY_USED"
    );
  });

  it("blocks suspended users from resolving sessions", async () => {
    process.env.NODE_ENV = "development";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "test-auth-secret";
    process.env.STORE_DRIVER = "json";
    delete process.env.DATABASE_URL;
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { createChallenge, completeLogin, resolveSession } = await import(
      "../src/services/authService.js"
    );
    const { usersRepo, sessionsRepo } = await import("../src/repositories/index.js");
    const { Keypair } = await import("@stellar/stellar-sdk");
    const kp = Keypair.random();
    const challenge = await createChallenge({ publicKey: kp.publicKey() });
    const signature = kp.sign(Buffer.from(challenge.message, "utf8")).toString("base64");
    const { sessionId, user } = await completeLogin({
      publicKey: kp.publicKey(),
      nonce: challenge.nonce,
      signature,
    });
    await usersRepo.updateStatus(user.id, "SUSPENDED");
    await sessionsRepo.revokeAllForUser(user.id);
    await assert.rejects(() => resolveSession(sessionId), (err) =>
      ["SESSION_REVOKED", "USER_SUSPENDED", "INVALID_SESSION"].includes(err.code)
    );
  });
});

describe("authorization roles", () => {
  it("blocks missing roles", async () => {
    process.env.NODE_ENV = "development";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.AUTH_SESSION_SECRET = "test-auth-secret";
    process.env.DEMO_MODE = "true";
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { createChallenge, completeLogin } = await import("../src/services/authService.js");
    const { requireRole } = await import("../src/middleware/auth.js");
    const { Roles } = await import("../src/auth/roles.js");

    const kp = Keypair.random();
    // Force donor-only by setting NGO keys to someone else so demo auto-NGO still applies...
    // In DEMO_MODE empty NGO list grants NGO — set a dummy NGO key so this wallet stays DONOR-only.
    process.env.NGO_PUBLIC_KEYS = Keypair.random().publicKey();
    process.env.VERIFIER_PUBLIC_KEYS = "";
    resetConfigCache();

    const challenge = await createChallenge({ publicKey: kp.publicKey() });
    const signature = kp.sign(Buffer.from(challenge.message, "utf8")).toString("base64");
    const { sessionId } = await completeLogin({
      publicKey: kp.publicKey(),
      nonce: challenge.nonce,
      signature,
    });

    const mw = requireRole(Roles.ADMIN);
    const req = {
      cookies: { remitrelief_sid: sessionId },
      get: () => null,
      path: "/test",
    };
    let err = null;
    await new Promise((resolve) => {
      mw(req, {}, (e) => {
        err = e;
        resolve();
      });
    });
    assert.equal(err?.code, "ROLE_REQUIRED");
    delete process.env.NGO_PUBLIC_KEYS;
  });
});

describe("donation recording security", () => {
  before(() => {
    process.env.NODE_ENV = "development";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.ALLOW_STORE_RESET = "true";
    delete process.env.NGO_PUBLIC_KEYS;
  });

  it("allows demo donation when DEMO_MODE and no escrow", async () => {
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { recordVerifiedDonation } = await import("../src/services/donationsService.js");
    const { statsRepo } = await import("../src/repositories/index.js");
    await statsRepo.reset();

    const entry = await recordVerifiedDonation({
      campaignId: "wildfire-relief-california",
      donor: "GTESTDONORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      amount: 12,
      demo: true,
      message: "phase2 test",
    });

    assert.equal(entry.verifiedOnChain, false);
    assert.equal(entry.source, "demo");
  });

  it("rejects body donor spoofing when authenticatedPublicKey mismatches", async () => {
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { recordVerifiedDonation } = await import("../src/services/donationsService.js");
    await assert.rejects(
      () =>
        recordVerifiedDonation({
          campaignId: "wildfire-relief-california",
          donor: "GSPOOFXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
          authenticatedPublicKey: "GREALXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
          amount: 5,
          demo: true,
        }),
      (err) => err.code === "FORBIDDEN"
    );
  });

  it("rejects on-chain donation without txHash", async () => {
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { recordVerifiedDonation } = await import("../src/services/donationsService.js");
    const { campaignsRepo, usersRepo } = await import("../src/repositories/index.js");
    const { StrKey } = await import("@stellar/stellar-sdk");
    const { randomBytes } = await import("node:crypto");

    const owner = await usersRepo.upsertFromLogin(Keypair.random().publicKey());
    const campaign = await campaignsRepo.create({
      title: "Escrow Gate Test Auth",
      shortDescription: "Gate test",
      description: "Rejects on-chain donation without txHash",
      category: "COMMUNITY",
      goalAmount: "1000",
      currency: "USDC",
      deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      visibility: "PUBLIC",
      ownerId: owner.id,
      ownerWallet: owner.walletAddress || owner.publicKey,
      recipientId: owner.id,
      milestones: [{ title: "Stage 1", targetAmount: "1000", sequence: 0 }],
    });
    const escrowAddress = StrKey.encodeContract(randomBytes(32));
    await campaignsRepo.setEscrowBinding(campaign.id, { escrowAddress });
    await campaignsRepo.transition(campaign.id, "SUBMITTED");
    await campaignsRepo.transition(campaign.id, "UNDER_REVIEW");
    await campaignsRepo.transition(campaign.id, "APPROVED");
    await campaignsRepo.transition(campaign.id, "ACTIVE");

    await assert.rejects(
      () =>
        recordVerifiedDonation({
          campaignId: campaign.id,
          donor: "GTESTDONORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
          amount: 5,
        }),
      (err) =>
        err.code === "TRANSACTION_NOT_VERIFIED" ||
        err.code === "CAMPAIGN_NOT_ACTIVE"
    );
  });
});

describe("release endpoint protection", () => {
  it("blocks real release without internal key", async () => {
    process.env.NODE_ENV = "development";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.INTERNAL_API_KEY = "secret-release-key";
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { releaseMilestone } = await import("../src/services/milestonesService.js");

    await assert.rejects(
      () =>
        releaseMilestone({
          id: "flood-relief-oaxaca",
          escrowAddress: "CCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKWX",
          milestoneIndex: 0,
          campaignId: "flood-relief-oaxaca",
        }),
      /Invalid or missing internal API key|UNAUTHORIZED/
    );
  });
});

describe("indexer ledger idempotency", () => {
  it("append twice with same txHash/type keeps one row", async () => {
    process.env.NODE_ENV = "development";
    process.env.DEMO_MODE = "true";
    process.env.STELLAR_NETWORK = "TESTNET";
    process.env.ALLOW_STORE_RESET = "true";
    const { resetConfigCache } = await import("../src/config.js");
    resetConfigCache();
    const { ledgerRepo, statsRepo } = await import("../src/repositories/index.js");
    await statsRepo.reset();

    const payload = {
      type: "donation",
      campaignId: "wildfire-relief-california",
      actor: "indexer",
      txHash: "abcd1234deadbeefauth",
      note: "indexed",
      verifiedOnChain: true,
      source: "on_chain",
    };
    const first = await ledgerRepo.append(payload);
    const second = await ledgerRepo.append(payload);
    assert.equal(second._duplicate, true);
    assert.equal(second.id, first.id);
  });
});
