import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { normalizeEvent } from "../src/blockchain/soroban/events.js";

describe("Phase 8 indexer & transparency", () => {
  it("normalizes deposit/verify/release events with amount and milestone index", () => {
    const deposit = normalizeEvent({
      topic: ["deposit", "GABC"],
      value: [250, 1000],
      txHash: "tx-deposit-1",
    });
    assert.equal(deposit.type, "donation");
    assert.equal(deposit.amount, 250);
    assert.equal(deposit.txHash, "tx-deposit-1");

    const verify = normalizeEvent({
      topics: ["verify", "GVER", "1"],
      value: 40,
      txHash: "tx-verify-1",
    });
    assert.equal(verify.type, "verify");
    assert.equal(verify.milestoneIndex, 1);
    assert.equal(verify.amount, 40);

    const release = normalizeEvent({
      topics: ["release", "GREC", "0"],
      value: 40,
      txHash: "tx-release-1",
    });
    assert.equal(release.type, "release");
    assert.equal(release.milestoneIndex, 0);
    assert.equal(release.amount, 40);
  });

  describe("API surfaces", () => {
    let baseUrl;
    let server;
    let adminToken;
    let donorToken;

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
      process.env.AUTH_SESSION_SECRET = "phase8-api-test-secret";
      process.env.VERCEL = "1";
      delete process.env.BACKEND_SIGNER_SECRET;

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

      [adminToken, donorToken] = await Promise.all([login(admin), login(donor)]);
    });

    after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
    });

    it("paginates ledger and exposes on-chain vs demo stats", async () => {
      const ledger = await api("/api/ledger?limit=5&page=1");
      assert.equal(ledger.response.status, 200);
      assert.equal(ledger.payload.success, true);
      assert.ok(Array.isArray(ledger.payload.data));
      assert.ok(ledger.payload.meta);
      assert.equal(ledger.payload.meta.page, 1);
      assert.ok(ledger.payload.meta.limit <= 5);

      const stats = await api("/api/ledger/stats");
      assert.equal(stats.response.status, 200);
      assert.equal(typeof stats.payload.onChainLedgerEvents, "number");
      assert.equal(typeof stats.payload.demoLedgerEvents, "number");
    });

    it("allows ADMIN to run indexer and rejects non-admin", async () => {
      const denied = await api("/api/admin/indexer/run", {
        token: donorToken,
        method: "POST",
        body: {},
      });
      assert.equal(denied.response.status, 403);

      const run = await api("/api/admin/indexer/run", {
        token: adminToken,
        method: "POST",
        body: { limitPerContract: 10, maxPages: 1 },
      });
      assert.equal(run.response.status, 200);
      assert.equal(run.payload.success, true);
      assert.equal(typeof run.payload.data.scanned, "number");
      assert.equal(typeof run.payload.data.appended, "number");

      const status = await api("/api/admin/indexer", { token: adminToken });
      assert.equal(status.response.status, 200);
      assert.ok(status.payload.data.lastRun);
      assert.equal(typeof status.payload.data.escrowCampaigns, "number");
    });
  });
});
