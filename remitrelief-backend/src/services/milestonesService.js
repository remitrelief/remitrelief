import { assertDemoModeAllowed, requireInternalApiKey } from "../config.js";
import { AppError, ErrorCodes } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { campaignsRepo, ledgerRepo, milestonesRepo } from "../repositories/index.js";
import {
  buildVerifyMilestoneXdr,
  releaseMilestoneFunds,
  getMilestones,
  submitSignedXdr,
  verifyMilestoneVerificationTransaction,
} from "../blockchain/soroban/index.js";

async function syncMilestoneVerified(campaign, milestoneIndex) {
  if (!campaign?.id) return;
  await milestonesRepo.markVerifiedByIndex(campaign.id, milestoneIndex);
  const next = Math.min(
    Number(campaign.milestonesTotal),
    Math.max(Number(campaign.milestonesVerified), Number(milestoneIndex) + 1)
  );
  await campaignsRepo.setMilestonesVerified(campaign.id, next);
}

async function syncMilestoneReleased(campaign, milestoneIndex) {
  if (!campaign?.id) return;
  await milestonesRepo.markReleasedByIndex(campaign.id, milestoneIndex);
}

export async function prepareVerify({ escrowAddress, milestoneIndex, verifierPublicKey }) {
  if (!escrowAddress || milestoneIndex === undefined || !verifierPublicKey) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "missing required fields");
  }
  const { unsignedXdr } = await buildVerifyMilestoneXdr({
    escrowAddress,
    milestoneIndex,
    verifierPublicKey,
  });
  return { unsignedXdr };
}

export async function verifyMilestone({
  id,
  escrowAddress,
  milestoneIndex,
  verifierPublicKey,
  verifierSignedXDR,
  campaignId,
  proofNote = "",
  demo = false,
  autoRelease = true,
}) {
  const cid = campaignId || id;
  const campaign = await campaignsRepo.getById(cid);
  const boundEscrow = escrowAddress || campaign?.escrowAddress;
  const wantsDemo = Boolean(demo) || !boundEscrow;

  if (wantsDemo) {
    assertDemoModeAllowed();
    const label = campaign?.milestoneLabels?.[Number(milestoneIndex)]?.label;
    if (campaign) {
      await syncMilestoneVerified(campaign, milestoneIndex);
    }
    const event = await ledgerRepo.append({
      type: "verify",
      campaignId: cid,
      milestoneIndex: Number(milestoneIndex),
      actor: verifierPublicKey || "demo-verifier",
      note: label
        ? `Milestone ${milestoneIndex} verified: ${label}`
        : `Milestone ${milestoneIndex} verified (demo)`,
      proofNote: String(proofNote || "").slice(0, 500) || undefined,
      verifiedOnChain: false,
      source: "demo",
    });

    let releaseEvent = null;
    if (autoRelease) {
      releaseEvent = await releaseMilestone({
        id,
        campaignId: cid,
        milestoneIndex,
        amount: campaign?.milestoneLabels?.[Number(milestoneIndex)]?.amount,
        demo: true,
      });
    }

    return { milestoneId: id, verified: true, demo: true, event, release: releaseEvent };
  }

  if (milestoneIndex === undefined || !verifierSignedXDR || !verifierPublicKey) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "missing required fields for on-chain verify");
  }

  verifyMilestoneVerificationTransaction({
    signedXdr: verifierSignedXDR,
    escrowAddress: boundEscrow,
    milestoneIndex: Number(milestoneIndex),
    verifierPublicKey,
  });

  logger.info("Submitting verified milestone XDR", {
    escrowAddress: boundEscrow,
    milestoneIndex,
    verifierPublicKey,
  });

  const result = await submitSignedXdr(verifierSignedXDR);

  if (campaign) {
    await syncMilestoneVerified(campaign, milestoneIndex);
  }

  const event = await ledgerRepo.append({
    type: "verify",
    campaignId: cid,
    milestoneIndex: Number(milestoneIndex),
    actor: verifierPublicKey,
    txHash: result.hash,
    note: `Milestone ${milestoneIndex} verified on-chain`,
    proofNote: String(proofNote || "").slice(0, 500) || undefined,
    verifiedOnChain: true,
    source: "on_chain",
  });

  let releaseResult = null;
  if (autoRelease) {
    releaseResult = await releaseMilestone({
      id,
      escrowAddress: boundEscrow,
      milestoneIndex,
      campaignId: cid,
      amount: campaign?.milestoneLabels?.[Number(milestoneIndex)]?.amount,
      internalAuthorized: true,
    });
  }

  return {
    milestoneId: id,
    verified: true,
    txHash: result.hash,
    event,
    release: releaseResult,
  };
}

/**
 * Privileged release.
 * - demo: DEMO_MODE only
 * - real: requires internalAuthorized OR INTERNAL_API_KEY OR operatorAuthorized
 */
export async function releaseMilestone({
  id,
  escrowAddress,
  milestoneIndex,
  campaignId,
  demo = false,
  amount,
  internalApiKey,
  internalAuthorized = false,
  operatorAuthorized = false,
}) {
  const cid = campaignId || id;
  const campaign = await campaignsRepo.getById(cid);
  const boundEscrow = escrowAddress || campaign?.escrowAddress;
  const wantsDemo = Boolean(demo) || !boundEscrow;

  if (wantsDemo) {
    assertDemoModeAllowed();
    if (campaign) {
      await syncMilestoneReleased(campaign, milestoneIndex);
    }
    const event = await ledgerRepo.append({
      type: "release",
      campaignId: cid,
      milestoneIndex: Number(milestoneIndex),
      amount: amount != null ? Number(amount) : undefined,
      actor: "system",
      note: `Milestone ${milestoneIndex} released (demo)`,
      verifiedOnChain: false,
      source: "demo",
    });
    return { milestoneId: id, released: true, demo: true, event };
  }

  if (milestoneIndex === undefined || !boundEscrow) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "missing required fields");
  }

  if (!internalAuthorized && !operatorAuthorized) {
    requireInternalApiKey(internalApiKey);
  }

  logger.info("Releasing milestone funds", { escrowAddress: boundEscrow, milestoneIndex });
  const result = await releaseMilestoneFunds({
    escrowAddress: boundEscrow,
    milestoneIndex: Number(milestoneIndex),
  });

  if (campaign) {
    await syncMilestoneReleased(campaign, milestoneIndex);
  }

  const event = await ledgerRepo.append({
    type: "release",
    campaignId: cid,
    milestoneIndex: Number(milestoneIndex),
    amount: amount != null ? Number(amount) : undefined,
    actor: "system",
    txHash: result.hash,
    note: `Milestone ${milestoneIndex} released on-chain`,
    verifiedOnChain: true,
    source: "on_chain",
  });

  return { milestoneId: id, released: true, txHash: result.hash, event };
}

export async function fetchOnChainMilestones(escrowAddress) {
  return getMilestones(escrowAddress);
}
