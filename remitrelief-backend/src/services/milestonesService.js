import { assertDemoModeAllowed, loadConfig, requireInternalApiKey } from "../config.js";
import { AppError, ErrorCodes } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import {
  auditRepo,
  campaignsRepo,
  ledgerRepo,
  milestonesRepo,
  proofsRepo,
} from "../repositories/index.js";
import {
  buildVerifyMilestoneXdr,
  releaseMilestoneFunds,
  getMilestones,
  submitSignedXdr,
  verifyMilestoneVerificationTransaction,
} from "../blockchain/soroban/index.js";

function optionalHttpUrl(value, field) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (!["https:", "http:"].includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
    return url.toString();
  } catch {
    throw new AppError(ErrorCodes.PROOF_INVALID, `${field} must be a valid HTTP(S) URL`);
  }
}

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

async function requireActiveCampaign(campaignId) {
  const campaign = await campaignsRepo.getById(campaignId);
  if (!campaign) {
    throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "Campaign not found");
  }
  if (campaign.status !== "ACTIVE") {
    throw new AppError(
      ErrorCodes.CAMPAIGN_NOT_ACTIVE,
      "Milestone actions require an ACTIVE campaign"
    );
  }
  return campaign;
}

function resolveBoundEscrow(campaign, clientEscrow) {
  if (clientEscrow && campaign.escrowAddress && clientEscrow !== campaign.escrowAddress) {
    throw new AppError(
      ErrorCodes.ESCROW_MISMATCH,
      "Client escrow does not match the campaign bound escrow"
    );
  }
  return campaign.escrowAddress || null;
}

async function assertProofPresent(campaignId, milestoneIndex) {
  const proof = await proofsRepo.latestForMilestone(campaignId, milestoneIndex);
  if (!proof) {
    throw new AppError(
      ErrorCodes.PROOF_REQUIRED,
      "Submit milestone proof before verification"
    );
  }
  return proof;
}

export async function submitProof({
  campaignId,
  milestoneIndex,
  note,
  evidenceUrls = [],
  actor,
}) {
  if (campaignId == null || milestoneIndex === undefined) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "campaignId and milestoneIndex are required");
  }
  const campaign = await requireActiveCampaign(campaignId);
  const index = Number(milestoneIndex);
  if (!Number.isInteger(index) || index < 0) {
    throw new AppError(ErrorCodes.MILESTONE_INVALID, "milestoneIndex must be a non-negative integer");
  }

  const relational = await milestonesRepo.findByCampaignAndIndex(campaign.id, index);
  if (relational?.verified) {
    throw new AppError(
      ErrorCodes.MILESTONE_ALREADY_VERIFIED,
      "Milestone is already verified"
    );
  }

  const cleanedNote = String(note || "").trim();
  if (cleanedNote.length < 10) {
    throw new AppError(ErrorCodes.PROOF_INVALID, "Proof note must be at least 10 characters");
  }
  if (cleanedNote.length > 2000) {
    throw new AppError(ErrorCodes.PROOF_INVALID, "Proof note must be at most 2000 characters");
  }

  const urls = (Array.isArray(evidenceUrls) ? evidenceUrls : [])
    .slice(0, 10)
    .map((url, i) => optionalHttpUrl(url, `evidenceUrls[${i}]`))
    .filter(Boolean);

  const proof = await proofsRepo.create({
    campaignId: campaign.id,
    milestoneId: relational?.id || null,
    milestoneIndex: index,
    note: cleanedNote,
    evidenceUrls: urls,
    submittedByWallet: actor?.walletAddress || actor?.publicKey,
    submittedByUserId: actor?.id || null,
  });

  await auditRepo.create({
    userId: actor?.id || null,
    action: "PROOF_SUBMITTED",
    resourceType: "Milestone",
    resourceId: `${campaign.id}:${index}`,
    metadata: { proofId: proof.id, evidenceCount: urls.length },
  });

  return proof;
}

export async function listProofs(campaignId, { milestoneIndex } = {}) {
  const campaign = await campaignsRepo.getById(campaignId);
  if (!campaign) {
    throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "Campaign not found");
  }
  return proofsRepo.listByCampaign(campaign.id, { milestoneIndex });
}

export async function prepareVerify({ campaignId, milestoneIndex, verifierPublicKey }) {
  if (!campaignId || milestoneIndex === undefined || !verifierPublicKey) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "missing required fields");
  }
  const campaign = await requireActiveCampaign(campaignId);
  const escrowAddress = campaign.escrowAddress;
  if (!escrowAddress) {
    throw new AppError(ErrorCodes.ESCROW_NOT_BOUND, "Campaign has no bound escrow address");
  }
  await assertProofPresent(campaign.id, milestoneIndex);

  const relational = await milestonesRepo.findByCampaignAndIndex(campaign.id, milestoneIndex);
  if (relational?.verified) {
    throw new AppError(
      ErrorCodes.MILESTONE_ALREADY_VERIFIED,
      "Milestone is already verified"
    );
  }

  const { unsignedXdr } = await buildVerifyMilestoneXdr({
    escrowAddress,
    milestoneIndex,
    verifierPublicKey,
  });
  return { unsignedXdr, escrowAddress, campaignId: campaign.id };
}

export async function verifyMilestone({
  id,
  escrowAddress: clientEscrow,
  milestoneIndex,
  verifierPublicKey,
  verifierSignedXDR,
  campaignId,
  proofNote = "",
  demo = false,
  autoRelease = false,
}) {
  const cid = campaignId || id;
  const campaign = await requireActiveCampaign(cid);
  const boundEscrow = resolveBoundEscrow(campaign, clientEscrow);
  const index = Number(milestoneIndex);
  const cfg = loadConfig();

  const relational = await milestonesRepo.findByCampaignAndIndex(campaign.id, index);
  if (relational?.verified) {
    throw new AppError(
      ErrorCodes.MILESTONE_ALREADY_VERIFIED,
      "Milestone is already verified"
    );
  }

  let proof = await proofsRepo.latestForMilestone(campaign.id, index);
  if (!proof && proofNote && String(proofNote).trim().length >= 10) {
    // Backward-compatible: accept a one-shot proof note on verify in DEMO only
    if (!cfg.demoMode) {
      throw new AppError(ErrorCodes.PROOF_REQUIRED, "Submit milestone proof before verification");
    }
    proof = await proofsRepo.create({
      campaignId: campaign.id,
      milestoneId: relational?.id || null,
      milestoneIndex: index,
      note: String(proofNote).trim().slice(0, 2000),
      evidenceUrls: [],
      submittedByWallet: verifierPublicKey || "demo-verifier",
    });
  }
  if (!proof) {
    throw new AppError(ErrorCodes.PROOF_REQUIRED, "Submit milestone proof before verification");
  }

  const wantsDemo = Boolean(demo) || !boundEscrow;
  if (wantsDemo && boundEscrow && demo) {
    throw new AppError(
      ErrorCodes.INVALID_REQUEST,
      "Demo verification is not allowed when an escrow is bound"
    );
  }
  if (wantsDemo) {
    if (!cfg.demoMode) {
      throw new AppError(ErrorCodes.ESCROW_NOT_BOUND, "Campaign has no bound escrow address");
    }
    assertDemoModeAllowed();
    await syncMilestoneVerified(campaign, index);
    const event = await ledgerRepo.append({
      type: "verify",
      campaignId: cid,
      milestoneIndex: index,
      actor: verifierPublicKey || "demo-verifier",
      note: `Milestone ${index} verified (demo)`,
      proofNote: proof.note,
      verifiedOnChain: false,
      source: "demo",
    });

    await auditRepo.create({
      userId: null,
      action: "MILESTONE_VERIFIED",
      resourceType: "Milestone",
      resourceId: `${cid}:${index}`,
      metadata: { demo: true, proofId: proof.id },
    });

    let releaseEvent = null;
    if (autoRelease) {
      releaseEvent = await releaseMilestone({
        id,
        campaignId: cid,
        milestoneIndex: index,
        amount: campaign?.milestoneLabels?.[index]?.amount,
        demo: true,
        operatorAuthorized: true,
      });
    }

    return { milestoneId: id, verified: true, demo: true, event, release: releaseEvent, proof };
  }

  if (milestoneIndex === undefined || !verifierSignedXDR || !verifierPublicKey) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "missing required fields for on-chain verify");
  }

  verifyMilestoneVerificationTransaction({
    signedXdr: verifierSignedXDR,
    escrowAddress: boundEscrow,
    milestoneIndex: index,
    verifierPublicKey,
  });

  logger.info("Submitting verified milestone XDR", {
    escrowAddress: boundEscrow,
    milestoneIndex: index,
    verifierPublicKey,
  });

  const result = await submitSignedXdr(verifierSignedXDR);
  await syncMilestoneVerified(campaign, index);

  const event = await ledgerRepo.append({
    type: "verify",
    campaignId: cid,
    milestoneIndex: index,
    actor: verifierPublicKey,
    txHash: result.hash,
    note: `Milestone ${index} verified on-chain`,
    proofNote: proof.note,
    verifiedOnChain: true,
    source: "on_chain",
  });

  await auditRepo.create({
    userId: null,
    action: "MILESTONE_VERIFIED",
    resourceType: "Milestone",
    resourceId: `${cid}:${index}`,
    metadata: { txHash: result.hash, proofId: proof.id },
  });

  let releaseResult = null;
  if (autoRelease) {
    releaseResult = await releaseMilestone({
      id,
      escrowAddress: boundEscrow,
      milestoneIndex: index,
      campaignId: cid,
      amount: campaign?.milestoneLabels?.[index]?.amount,
      internalAuthorized: true,
    });
  }

  return {
    milestoneId: id,
    verified: true,
    txHash: result.hash,
    event,
    release: releaseResult,
    proof,
  };
}

/**
 * Privileged release.
 * - demo: DEMO_MODE only
 * - real: requires internalAuthorized OR INTERNAL_API_KEY OR operatorAuthorized
 */
export async function releaseMilestone({
  id,
  escrowAddress: clientEscrow,
  milestoneIndex,
  campaignId,
  demo = false,
  amount,
  internalApiKey,
  internalAuthorized = false,
  operatorAuthorized = false,
}) {
  const cid = campaignId || id;
  const campaign = await requireActiveCampaign(cid);
  const boundEscrow = resolveBoundEscrow(campaign, clientEscrow);
  const index = Number(milestoneIndex);
  const cfg = loadConfig();
  const wantsDemo = Boolean(demo) || !boundEscrow;

  if (!boundEscrow) {
    if (!cfg.demoMode) {
      throw new AppError(ErrorCodes.ESCROW_NOT_BOUND, "Campaign has no bound escrow address");
    }
  } else if (demo) {
    throw new AppError(
      ErrorCodes.INVALID_REQUEST,
      "Demo release is not allowed when an escrow is bound"
    );
  }

  const relational = await milestonesRepo.findByCampaignAndIndex(campaign.id, index);
  if (relational?.released) {
    throw new AppError(
      ErrorCodes.MILESTONE_ALREADY_RELEASED,
      "Milestone funds were already released"
    );
  }
  if (!wantsDemo) {
    const verified =
      relational?.verified ||
      Number((await campaignsRepo.getById(campaign.id)).milestonesVerified) > index;
    if (!verified) {
      throw new AppError(
        ErrorCodes.MILESTONE_NOT_VERIFIED,
        "Milestone must be verified before release"
      );
    }
  }

  if (wantsDemo) {
    assertDemoModeAllowed();
    await syncMilestoneReleased(campaign, index);
    const event = await ledgerRepo.append({
      type: "release",
      campaignId: cid,
      milestoneIndex: index,
      amount: amount != null ? Number(amount) : undefined,
      actor: "system",
      note: `Milestone ${index} released (demo)`,
      verifiedOnChain: false,
      source: "demo",
    });
    await auditRepo.create({
      userId: null,
      action: "MILESTONE_RELEASED",
      resourceType: "Milestone",
      resourceId: `${cid}:${index}`,
      metadata: { demo: true },
    });
    return { milestoneId: id, released: true, demo: true, event };
  }

  if (milestoneIndex === undefined || !boundEscrow) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "missing required fields");
  }

  if (!internalAuthorized && !operatorAuthorized) {
    requireInternalApiKey(internalApiKey);
  }

  logger.info("Releasing milestone funds", { escrowAddress: boundEscrow, milestoneIndex: index });
  const result = await releaseMilestoneFunds({
    escrowAddress: boundEscrow,
    milestoneIndex: index,
  });

  await syncMilestoneReleased(campaign, index);

  const event = await ledgerRepo.append({
    type: "release",
    campaignId: cid,
    milestoneIndex: index,
    amount: amount != null ? Number(amount) : undefined,
    actor: "system",
    txHash: result.hash,
    note: `Milestone ${index} released on-chain`,
    verifiedOnChain: true,
    source: "on_chain",
  });

  await auditRepo.create({
    userId: null,
    action: "MILESTONE_RELEASED",
    resourceType: "Milestone",
    resourceId: `${cid}:${index}`,
    metadata: { txHash: result.hash },
  });

  return { milestoneId: id, released: true, txHash: result.hash, event };
}

export async function fetchOnChainMilestones(escrowAddress) {
  return getMilestones(escrowAddress);
}
