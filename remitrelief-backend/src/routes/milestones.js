import { Router } from "express";
import {
  fetchOnChainMilestones,
  listProofs,
  prepareVerify,
  releaseMilestone,
  submitProof,
  verifyMilestone,
} from "../services/milestonesService.js";
import { requireOperatorOrInternalKey, requireRole } from "../middleware/auth.js";
import { Roles } from "../auth/roles.js";
import { toErrorResponse } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/:id/proof", requireRole(Roles.NGO, Roles.ADMIN), async (req, res) => {
  try {
    const body = req.body || {};
    const proof = await submitProof({
      campaignId: body.campaignId || req.params.id,
      milestoneIndex: body.milestoneIndex,
      note: body.note || body.proofNote,
      evidenceUrls: body.evidenceUrls,
      actor: req.user,
    });
    res.status(201).json(proof);
  } catch (err) {
    logger.error("submit proof failed", { reason: err.message, code: err.code });
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get("/:id/proofs", async (req, res) => {
  try {
    const proofs = await listProofs(req.params.id, {
      milestoneIndex:
        req.query.milestoneIndex !== undefined
          ? Number(req.query.milestoneIndex)
          : undefined,
    });
    res.json(proofs);
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

router.post(
  "/:id/prepare-verify",
  requireRole(Roles.NGO, Roles.ADMIN),
  async (req, res) => {
    try {
      const body = req.body || {};
      const result = await prepareVerify({
        campaignId: body.campaignId || req.params.id,
        milestoneIndex: body.milestoneIndex,
        verifierPublicKey: req.user.walletAddress,
      });
      res.json(result);
    } catch (err) {
      logger.error("prepare-verify failed", { reason: err.message });
      const { status, body } = toErrorResponse(err);
      res.status(status).json(body);
    }
  }
);

router.post("/:id/verify", requireRole(Roles.NGO, Roles.ADMIN), async (req, res) => {
  try {
    const body = req.body || {};
    const result = await verifyMilestone({
      id: req.params.id,
      // Client escrow ignored for binding; mismatch still rejected inside service
      escrowAddress: body.escrowAddress,
      milestoneIndex: body.milestoneIndex,
      verifierSignedXDR: body.verifierSignedXDR,
      campaignId: body.campaignId || req.params.id,
      proofNote: body.proofNote,
      demo: body.demo,
      autoRelease: body.autoRelease === true,
      verifierPublicKey: req.user.walletAddress,
    });
    res.json(result);
  } catch (err) {
    logger.error("verify failed", { reason: err.message, code: err.code });
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

router.post("/:id/release", requireOperatorOrInternalKey, async (req, res) => {
  try {
    const internalApiKey = req.get("x-internal-api-key") || req.body?.internalApiKey;
    const result = await releaseMilestone({
      id: req.params.id,
      escrowAddress: req.body?.escrowAddress,
      milestoneIndex: req.body?.milestoneIndex,
      campaignId: req.body?.campaignId || req.params.id,
      amount: req.body?.amount,
      demo: req.body?.demo,
      internalApiKey,
      internalAuthorized: Boolean(req.internalAuthorized),
      operatorAuthorized: Boolean(req.operatorAuthorized),
    });
    res.json(result);
  } catch (err) {
    logger.error("release failed", { reason: err.message, code: err.code });
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get("/escrow/:escrowAddress", async (req, res) => {
  try {
    const milestones = await fetchOnChainMilestones(req.params.escrowAddress);
    res.json(milestones);
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

export default router;
