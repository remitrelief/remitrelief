import { Router } from "express";
import {
  listDonations,
  prepareDonation,
  recordVerifiedDonation,
} from "../services/donationsService.js";
import { requireAuth } from "../middleware/auth.js";
import { toErrorResponse } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/prepare", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await prepareDonation({
      campaignId: body.campaignId,
      amount: body.amount,
      // Identity from session only — ignore client donor / escrow fields
      donorPublicKey: req.user.walletAddress,
    });
    res.json(result);
  } catch (err) {
    logger.error("prepare donation failed", { reason: err.message });
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const entry = await recordVerifiedDonation({
      campaignId: body.campaignId,
      amount: body.amount,
      txHash: body.txHash,
      message: body.message,
      demo: body.demo,
      // Identity from authenticated session only
      donor: req.user.walletAddress,
      authenticatedPublicKey: req.user.walletAddress,
    });
    res.status(201).json(entry);
  } catch (err) {
    logger.error("record donation failed", { reason: err.message, code: err.code });
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

/** Own donations: authenticated filter to session wallet unless ADMIN listing all via query omitted */
router.get("/", requireAuth, async (req, res) => {
  const { campaignId } = req.query;
  const donor =
    req.user.roles?.includes("ADMIN") && req.query.donor
      ? req.query.donor
      : req.user.walletAddress;
  res.json(await listDonations({ donor, campaignId }));
});

export default router;
