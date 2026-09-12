import { loadConfig, assertDemoModeAllowed } from "../config.js";
import { AppError, ErrorCodes } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { campaignsRepo, donationsRepo } from "../repositories/index.js";
import {
  buildDepositXdr,
  verifyDonationTransaction,
} from "../blockchain/soroban/index.js";

/**
 * Prepare an on-chain deposit against the campaign's bound escrow only.
 * Client-supplied escrow addresses are ignored.
 */
export async function prepareDonation({ campaignId, donorPublicKey, amount }) {
  if (!campaignId || !donorPublicKey || amount == null) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "missing required fields");
  }
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "amount must be > 0");
  }

  const campaign = await campaignsRepo.getById(campaignId);
  if (!campaign) {
    throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "campaign not found");
  }
  if (campaign.status !== "ACTIVE") {
    throw new AppError(
      ErrorCodes.CAMPAIGN_NOT_ACTIVE,
      "Donations are accepted only for active campaigns"
    );
  }
  if (!campaign.escrowAddress) {
    throw new AppError(
      ErrorCodes.ESCROW_NOT_BOUND,
      "Campaign has no bound escrow address"
    );
  }

  const amountStroops = Math.round(amountNum * 10 ** loadConfig().stellar.usdcDecimals);
  const { unsignedXdr } = await buildDepositXdr({
    escrowAddress: campaign.escrowAddress,
    donorPublicKey,
    amountStroops,
  });
  return {
    unsignedXdr,
    amountStroops,
    amountUsd: amountNum,
    escrowAddress: campaign.escrowAddress,
    campaignId: campaign.id,
  };
}

/**
 * Record a donation only after:
 * - demo path (DEMO_MODE + no escrow), OR
 * - successful on-chain deposit verification against the bound escrow
 */
export async function recordVerifiedDonation({
  campaignId,
  donor,
  amount,
  txHash,
  message = "",
  demo = false,
  authenticatedPublicKey = null,
}) {
  if (!campaignId || !donor || amount == null) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "missing required fields");
  }

  if (authenticatedPublicKey && authenticatedPublicKey !== donor) {
    throw new AppError(ErrorCodes.FORBIDDEN, "donor must match authenticated wallet");
  }

  const campaign = await campaignsRepo.getById(campaignId);
  if (!campaign) {
    throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "campaign not found");
  }
  if (campaign.status !== "ACTIVE") {
    throw new AppError(
      ErrorCodes.CAMPAIGN_NOT_ACTIVE,
      "Donations are accepted only for active campaigns"
    );
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "amount must be > 0");
  }

  const cfg = loadConfig();
  const hasEscrow = Boolean(campaign.escrowAddress);

  if (!hasEscrow) {
    if (!cfg.demoMode) {
      throw new AppError(
        ErrorCodes.ESCROW_NOT_BOUND,
        "Campaign has no bound escrow address"
      );
    }
    assertDemoModeAllowed();
    logger.info("Recording demo donation (non-verified)", {
      campaignId,
      donor,
      amount: amountNum,
    });
    return donationsRepo.create({
      campaignId,
      donor,
      amount: amountNum,
      txHash: null,
      status: "demo-escrowed",
      message,
      verifiedOnChain: false,
      source: "demo",
    });
  }

  // Bound escrow: always require on-chain verification (ignore client demo flag)
  if (demo) {
    throw new AppError(
      ErrorCodes.INVALID_REQUEST,
      "Demo donations are not allowed when an escrow is bound"
    );
  }

  if (!txHash) {
    throw new AppError(ErrorCodes.TRANSACTION_NOT_VERIFIED, "txHash required for on-chain donations");
  }

  const existing = await donationsRepo.findByTxHash(txHash);
  if (existing) {
    throw new AppError(ErrorCodes.DONATION_ALREADY_RECORDED, "donation already recorded for this tx");
  }

  const amountStroops = Math.round(amountNum * 10 ** cfg.stellar.usdcDecimals);

  logger.info("Verifying donation transaction", {
    txHash,
    campaignId,
    escrow: campaign.escrowAddress,
  });
  await verifyDonationTransaction({
    txHash,
    escrowAddress: campaign.escrowAddress,
    donorPublicKey: donor,
    amountStroops,
  });

  return donationsRepo.create({
    campaignId,
    donor,
    amount: amountNum,
    txHash,
    status: "CONFIRMED",
    message,
    verifiedOnChain: true,
    source: "on_chain",
    contractAddress: campaign.escrowAddress,
  });
}

export async function listDonations(filters) {
  return donationsRepo.list(filters);
}
