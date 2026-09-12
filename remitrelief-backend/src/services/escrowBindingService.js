import { StrKey } from "@stellar/stellar-sdk";
import { loadConfig } from "../config.js";
import { AppError, ErrorCodes } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { getEscrowBalance, getMilestones } from "../blockchain/soroban/index.js";

export function assertValidEscrowContractId(address, fieldName = "escrowAddress") {
  if (!address || typeof address !== "string") {
    throw new AppError(ErrorCodes.ESCROW_INVALID, `${fieldName} is required`);
  }
  const trimmed = address.trim();
  if (!trimmed.startsWith("C") || !StrKey.isValidContract(trimmed)) {
    throw new AppError(
      ErrorCodes.ESCROW_INVALID,
      `${fieldName} is not a valid Stellar contract ID`
    );
  }
  return trimmed;
}

function amountsClose(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.0000001;
}

/**
 * When RPC/signer is available, read on-chain milestones/balance and optionally
 * compare against campaign milestone definitions.
 * Outside DEMO_MODE, unreadable escrows are rejected.
 */
export async function assertEscrowReadable(escrowAddress, campaign = null) {
  const address = assertValidEscrowContractId(escrowAddress);
  const cfg = loadConfig();
  const canRead = Boolean(cfg.secrets.backendSignerSecret);

  if (!canRead) {
    if (!cfg.demoMode) {
      throw new AppError(
        ErrorCodes.ESCROW_INVALID,
        "Cannot validate escrow readability without BACKEND_SIGNER_SECRET"
      );
    }
    logger.warn("Skipping on-chain escrow readability check (no signer, DEMO_MODE)", {
      escrowAddress: address,
    });
    return { escrowAddress: address, skipped: true };
  }

  try {
    const [balance, onChainMilestones] = await Promise.all([
      getEscrowBalance(address),
      getMilestones(address),
    ]);

    if (campaign?.milestones?.length && Array.isArray(onChainMilestones)) {
      if (onChainMilestones.length !== campaign.milestones.length) {
        throw new AppError(
          ErrorCodes.ESCROW_MISMATCH,
          `Escrow has ${onChainMilestones.length} milestones; campaign has ${campaign.milestones.length}`
        );
      }
      for (let i = 0; i < campaign.milestones.length; i += 1) {
        const expectedUsd = Number(
          campaign.milestones[i].targetAmount ?? campaign.milestones[i].amount
        );
        const onChainUsd = Number(onChainMilestones[i]?.amount) / 10 ** cfg.stellar.usdcDecimals;
        if (!amountsClose(expectedUsd, onChainUsd)) {
          throw new AppError(
            ErrorCodes.ESCROW_MISMATCH,
            `Milestone ${i} amount mismatch (campaign ${expectedUsd} vs on-chain ${onChainUsd})`
          );
        }
      }
    }

    return {
      escrowAddress: address,
      balance,
      milestones: onChainMilestones,
      skipped: false,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("Escrow readability check failed", {
      escrowAddress: address,
      reason: err.message,
    });
    if (!cfg.demoMode) {
      throw new AppError(
        ErrorCodes.ESCROW_INVALID,
        "Escrow contract is not readable on the configured network"
      );
    }
    logger.warn("Allowing unreadable escrow in DEMO_MODE", { escrowAddress: address });
    return { escrowAddress: address, skipped: true, error: err.message };
  }
}
