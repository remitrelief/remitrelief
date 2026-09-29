/**
 * Extract invoke-host-function contract calls from a Transaction.
 * Returns [{ contractId, functionName, args[] }]
 */
import { Address, scValToNative } from "@stellar/stellar-sdk";
import { AppError, ErrorCodes } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { getTransaction } from "./client.js";
import { parseSignedTransaction } from "./transactions.js";
import { loadConfig } from "../../config.js";

/**
 * Read an XDR field regardless of representation: stellar-base <= 14 exposes
 * accessor methods (which throw on the wrong union arm), >= 15 plain properties.
 */
function xdrField(node, name) {
  if (node == null) return undefined;
  try {
    const value = node[name];
    return typeof value === "function" ? value.call(node) : value;
  } catch {
    return undefined;
  }
}

function contractIdFromScAddress(scAddress) {
  if (!scAddress) return null;
  try {
    return Address.fromScAddress(scAddress).toString();
  } catch {
    return null;
  }
}

function parseInvokeContract(invoke) {
  if (!invoke) return null;
  const rawFn = xdrField(invoke, "functionName");
  return {
    contractId: contractIdFromScAddress(xdrField(invoke, "contractAddress")),
    functionName: rawFn == null ? "" : String(rawFn),
    args: xdrField(invoke, "args") || [],
  };
}

export function extractContractInvocations(tx) {
  const invocations = [];

  for (const op of tx.operations || []) {
    if (op.type !== "invokeHostFunction") continue;
    const func = op.func;
    if (!func) continue;

    try {
      const invoke = xdrField(func, "invokeContract");
      const parsed = parseInvokeContract(invoke);
      if (parsed?.contractId && parsed.functionName) {
        invocations.push(parsed);
      }
    } catch (err) {
      logger.debug("Could not parse invokeHostFunction op", { reason: err.message });
    }
  }

  return invocations;
}

function scArgToNativeSafe(scVal) {
  try {
    return scValToNative(scVal);
  } catch {
    const scAddress = xdrField(scVal, "address");
    return scAddress ? contractIdFromScAddress(scAddress) : null;
  }
}

/**
 * Assert a signed/prepared transaction invokes the expected escrow method.
 */
export function assertExpectedInvocation(tx, { escrowAddress, functionName, expectedArgs = {} }) {
  const invocations = extractContractInvocations(tx);
  if (!invocations.length) {
    throw new AppError(ErrorCodes.INVALID_CONTRACT_CALL, "Transaction does not invoke a contract");
  }

  const match = invocations.find(
    (inv) => inv.contractId === escrowAddress && inv.functionName === functionName
  );

  if (!match) {
    throw new AppError(
      ErrorCodes.INVALID_CONTRACT_CALL,
      `Expected ${functionName} on ${escrowAddress}`,
      {
        details: {
          found: invocations.map((i) => ({ contractId: i.contractId, functionName: i.functionName })),
        },
      }
    );
  }

  const natives = (match.args || []).map(scArgToNativeSafe);

  if (expectedArgs.address != null) {
    const first = natives[0];
    if (first !== expectedArgs.address) {
      throw new AppError(ErrorCodes.INVALID_CONTRACT_CALL, "Invocation address argument mismatch", {
        details: { expected: expectedArgs.address, got: first },
      });
    }
  }

  if (expectedArgs.milestoneIndex != null) {
    const idx = Number(expectedArgs.milestoneIndex);
    const hasIndex = natives.some((a) => Number(a) === idx);
    if (!hasIndex) {
      throw new AppError(ErrorCodes.INVALID_CONTRACT_CALL, "Invocation milestone index mismatch", {
        details: { expected: idx, args: natives },
      });
    }
  }

  if (expectedArgs.amountStroops != null) {
    const amount = expectedArgs.amountStroops;
    const hasAmount = natives.some((a) => {
      try {
        return BigInt(a) === BigInt(amount);
      } catch {
        return Number(a) === Number(amount);
      }
    });
    if (!hasAmount) {
      throw new AppError(ErrorCodes.INVALID_CONTRACT_CALL, "Invocation amount mismatch", {
        details: { expected: String(amount), args: natives.map(String) },
      });
    }
  }

  return match;
}

export async function waitForSuccessfulTransaction(txHash) {
  const started = Date.now();
  const timeoutMs = 45000;
  while (Date.now() - started < timeoutMs) {
    const res = await getTransaction(txHash);
    if (res.status === "SUCCESS") return res;
    if (res.status === "FAILED") {
      throw new AppError(ErrorCodes.TRANSACTION_FAILED, `Transaction ${txHash} failed on-chain`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new AppError(ErrorCodes.TRANSACTION_NOT_FOUND, `Transaction ${txHash} not found or pending`);
}

/**
 * Verify a completed deposit transaction before recording a donation.
 */
export async function verifyDonationTransaction({
  txHash,
  escrowAddress,
  donorPublicKey,
  amountStroops,
}) {
  if (!txHash) {
    throw new AppError(ErrorCodes.TRANSACTION_NOT_VERIFIED, "txHash is required");
  }
  if (!escrowAddress) {
    throw new AppError(ErrorCodes.ESCROW_NOT_FOUND, "escrowAddress is required");
  }

  const res = await waitForSuccessfulTransaction(txHash);

  let tx = null;
  try {
    if (res.envelopeXdr) {
      const { TransactionBuilder } = await import("@stellar/stellar-sdk");
      tx = TransactionBuilder.fromXDR(res.envelopeXdr, loadConfig().stellar.networkPassphrase);
    }
  } catch (err) {
    logger.warn("Could not parse envelopeXdr from getTransaction", { txHash, reason: err.message });
  }

  if (tx) {
    assertExpectedInvocation(tx, {
      escrowAddress,
      functionName: "deposit",
      expectedArgs: { address: donorPublicKey, amountStroops },
    });
  } else {
    logger.warn("Donation verified by SUCCESS status only (envelope parse unavailable)", { txHash });
  }

  return {
    txHash,
    status: "SUCCESS",
    escrowAddress,
    donorPublicKey,
    amountStroops,
    verifiedOnChain: true,
  };
}

/**
 * Validate signed verify_milestone XDR before network submit.
 */
export function verifyMilestoneVerificationTransaction({
  signedXdr,
  escrowAddress,
  milestoneIndex,
  verifierPublicKey,
}) {
  const tx = parseSignedTransaction(signedXdr);
  assertExpectedInvocation(tx, {
    escrowAddress,
    functionName: "verify_milestone",
    expectedArgs: { address: verifierPublicKey, milestoneIndex: Number(milestoneIndex) },
  });
  return { tx, valid: true };
}

/**
 * Validate a release transaction hash / envelope if provided.
 */
export async function verifyReleaseTransaction({ txHash, escrowAddress, milestoneIndex }) {
  if (!txHash) {
    throw new AppError(ErrorCodes.TRANSACTION_NOT_VERIFIED, "txHash is required");
  }
  const res = await waitForSuccessfulTransaction(txHash);
  try {
    if (res.envelopeXdr) {
      const { TransactionBuilder } = await import("@stellar/stellar-sdk");
      const tx = TransactionBuilder.fromXDR(res.envelopeXdr, loadConfig().stellar.networkPassphrase);
      assertExpectedInvocation(tx, {
        escrowAddress,
        functionName: "release",
        expectedArgs: { milestoneIndex: Number(milestoneIndex) },
      });
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn("Release envelope parse soft-fail", { txHash, reason: err.message });
  }
  return { txHash, verifiedOnChain: true };
}
