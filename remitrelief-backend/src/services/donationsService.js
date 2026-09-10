import { loadConfig, assertDemoModeAllowed } from "../config.js";
import { AppError, ErrorCodes } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { campaignsRepo, donationsRepo } from "../repositories/index.js";
import {
  buildDepositXdr,
  verifyDonationTransaction,
} from "../blockchain/soroban/index.js";

export async function prepareDonation({ escrowAddress, donorPublicKey, amount }) {
  if (!escrowAddress || !donorPublicKey || amount == null) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "missing required fields");
  }
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "amount must be > 0");
  }

  const amountStroops = Math.round(amountNum * 10 ** loadConfig().stellar.usdcDecimals);
  const { unsignedXdr } = await buildDepositXdr({
    escrowAddress,
    donorPublicKey,
    amountStroops,
  });
  return { unsignedXdr, amountStroops, amountUsd: amountNum };
}

/**
 * Record a donation only after:
 * - demo path (DEMO_MODE + no escrow), OR
 * - successful on-chain deposit verification
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
      ErrorCodes.CAMPAIGN_INVALID_STATE,
      "Donations are accepted only for active campaigns"
    );
  }

  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "amount must be > 0");
  }

  const wantsDemo = Boolean(demo) || !campaign.escrowAddress;

  if (wantsDemo) {
    assertDemoModeAllowed();
    logger.info("Recording demo donation", { campaignId, donor, amount: amountNum });
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

  if (!txHash) {
    throw new AppError(ErrorCodes.TRANSACTION_NOT_VERIFIED, "txHash required for on-chain donations");
  }

  const existing = await donationsRepo.findByTxHash(txHash);
  if (existing) {
    throw new AppError(ErrorCodes.DONATION_ALREADY_RECORDED, "donation already recorded for this tx");
  }

  const amountStroops = Math.round(amountNum * 10 ** loadConfig().stellar.usdcDecimals);

  logger.info("Verifying donation transaction", { txHash, campaignId, escrow: campaign.escrowAddress });
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
  });
}

export async function listDonations(filters) {
  return donationsRepo.list(filters);
}
