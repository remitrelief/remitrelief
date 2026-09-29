import { Keypair } from "@stellar/stellar-sdk";
import { loadConfig } from "../config.js";
import { AppError, ErrorCodes } from "../lib/errors.js";
import { randomNonce } from "../lib/jwt.js";
import { generateSessionToken } from "../auth/sessionToken.js";
import { usersRepo, sessionsRepo } from "../repositories/index.js";
import { assertValidStellarPublicKey } from "../auth/walletValidation.js";
import { Roles, normalizeRoles } from "../auth/roles.js";
import { permissionsForRoles } from "../auth/permissions.js";
import { AuditEvents, recordAuthAudit } from "../auth/audit.js";

export function buildChallengeMessage({
  domain,
  network,
  walletAddress,
  nonce,
  issuedAt,
  expiresAt,
}) {
  return [
    "RemitRelief Authentication",
    "",
    `Domain: ${domain}`,
    `Network: Stellar ${network}`,
    "",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration: ${expiresAt}`,
    "",
    "Sign this message to securely authenticate with RemitRelief.",
    "This signature does not authorize a blockchain transaction.",
  ].join("\n");
}

export async function createChallenge({ publicKey }) {
  const walletAddress = assertValidStellarPublicKey(publicKey, "publicKey");
  const cfg = loadConfig();
  const nonce = randomNonce();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + cfg.auth.challengeTtlSec * 1000).toISOString();
  const message = buildChallengeMessage({
    domain: cfg.auth.domain,
    network: cfg.stellar.network,
    walletAddress,
    nonce,
    issuedAt,
    expiresAt,
  });

  await usersRepo.saveChallenge({
    publicKey: walletAddress,
    nonce,
    issuedAt,
    expiresAt,
    message,
    network: cfg.stellar.network,
    domain: cfg.auth.domain,
  });

  await recordAuthAudit(AuditEvents.AUTH_CHALLENGE_CREATED, { walletAddress });

  return {
    publicKey: walletAddress,
    walletAddress,
    nonce,
    issuedAt,
    expiresAt,
    network: cfg.stellar.network,
    domain: cfg.auth.domain,
    message,
  };
}

function decodeSignature(signature) {
  if (!signature) return null;
  const raw = String(signature).trim();
  try {
    if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
      return Buffer.from(raw, "hex");
    }
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
}

export function verifyChallengeSignature({ publicKey, message, signature }) {
  const sigBuf = decodeSignature(signature);
  if (!sigBuf) {
    throw new AppError(ErrorCodes.INVALID_SIGNATURE, "Invalid signature encoding");
  }
  const kp = Keypair.fromPublicKey(publicKey);
  const ok = kp.verify(Buffer.from(message, "utf8"), sigBuf);
  if (!ok) {
    throw new AppError(ErrorCodes.INVALID_SIGNATURE, "Signature verification failed");
  }
  return true;
}

export async function completeLogin({ publicKey, nonce, signature, signedMessage }) {
  const walletAddress = assertValidStellarPublicKey(publicKey, "publicKey");
  if (!nonce || !signature) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "nonce and signature are required");
  }

  const peek = usersRepo.getChallenge
    ? await usersRepo.getChallenge(walletAddress, nonce)
    : null;

  if (peek?.used) {
    await recordAuthAudit(AuditEvents.AUTH_FAILURE, {
      walletAddress,
      reason: "challenge_already_used",
    });
    throw new AppError(ErrorCodes.CHALLENGE_ALREADY_USED, "Challenge already used");
  }

  const challenge = await usersRepo.consumeChallenge(walletAddress, nonce);
  if (!challenge) {
    await recordAuthAudit(AuditEvents.AUTH_FAILURE, {
      walletAddress,
      reason: "unknown_challenge",
    });
    throw new AppError(ErrorCodes.INVALID_CHALLENGE, "Challenge not found");
  }
  if (challenge._alreadyUsed) {
    throw new AppError(ErrorCodes.CHALLENGE_ALREADY_USED, "Challenge already used");
  }
  if (new Date(challenge.expiresAt).getTime() < Date.now()) {
    await recordAuthAudit(AuditEvents.AUTH_FAILURE, {
      walletAddress,
      reason: "challenge_expired",
    });
    throw new AppError(ErrorCodes.CHALLENGE_EXPIRED, "Challenge expired");
  }

  const message = signedMessage || challenge.message;
  if (message !== challenge.message) {
    await recordAuthAudit(AuditEvents.AUTH_FAILURE, {
      walletAddress,
      reason: "message_mismatch",
    });
    throw new AppError(ErrorCodes.INVALID_CHALLENGE, "Challenge message mismatch");
  }

  try {
    verifyChallengeSignature({ publicKey: walletAddress, message, signature });
  } catch (err) {
    await recordAuthAudit(AuditEvents.AUTH_FAILURE, {
      walletAddress,
      reason: "invalid_signature",
    });
    throw err;
  }

  const user = await usersRepo.upsertFromLogin(walletAddress);
  if (user.status && user.status !== "ACTIVE") {
    await recordAuthAudit(AuditEvents.AUTH_FAILURE, {
      walletAddress,
      reason: "user_not_active",
      userId: user.id,
    });
    if (user.id && sessionsRepo.revokeAllForUser) {
      await sessionsRepo.revokeAllForUser(user.id);
    }
    throw new AppError(ErrorCodes.USER_SUSPENDED, `Account status is ${user.status}`);
  }

  const roles = normalizeRoles(user.roles);
  const cfg = loadConfig();
  const sessionId = generateSessionToken();
  const expiresAt = new Date(Date.now() + cfg.auth.sessionTtlSec * 1000).toISOString();

  const session = await sessionsRepo.create({
    id: sessionId,
    userId: user.id || walletAddress,
    walletAddress,
    roles,
    expiresAt,
  });

  await recordAuthAudit(AuditEvents.AUTH_SUCCESS, { walletAddress, sessionId, userId: user.id });
  await recordAuthAudit(AuditEvents.SESSION_CREATED, { walletAddress, sessionId, userId: user.id });

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    expiresIn: cfg.auth.sessionTtlSec,
    user: {
      id: user.id || walletAddress,
      walletAddress,
      publicKey: walletAddress,
      roles,
      role: user.role || roles[0],
      permissions: permissionsForRoles(roles),
      status: user.status || "ACTIVE",
      verificationStatus: user.verificationStatus || "UNVERIFIED",
    },
  };
}

export async function resolveSession(sessionId) {
  if (!sessionId) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required");
  }
  const session = await sessionsRepo.find(sessionId);
  if (!session) {
    throw new AppError(ErrorCodes.INVALID_SESSION, "Invalid session");
  }
  if (session.revokedAt) {
    throw new AppError(ErrorCodes.SESSION_REVOKED, "Session revoked");
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw new AppError(ErrorCodes.SESSION_EXPIRED, "Session expired");
  }
  await sessionsRepo.touch(sessionId);
  const user = await usersRepo.getByPublicKey(session.walletAddress);
  if (user?.status && user.status !== "ACTIVE") {
    await sessionsRepo.revoke(sessionId);
    throw new AppError(ErrorCodes.USER_SUSPENDED, `Account status is ${user.status}`);
  }
  const roles = normalizeRoles(user?.roles || session.roles || [Roles.DONOR]);
  return {
    sessionId: session.id,
    userId: session.userId,
    walletAddress: session.walletAddress,
    publicKey: session.walletAddress,
    roles,
    role: user?.role || roles[0],
    status: user?.status || "ACTIVE",
    verificationStatus: user?.verificationStatus || "UNVERIFIED",
    permissions: permissionsForRoles(roles),
    expiresAt: session.expiresAt,
  };
}

export async function logoutSession(sessionId) {
  if (!sessionId) return { ok: true };
  const session = await sessionsRepo.revoke(sessionId);
  if (session) {
    await recordAuthAudit(AuditEvents.SESSION_REVOKED, {
      walletAddress: session.walletAddress,
      sessionId,
    });
    await recordAuthAudit(AuditEvents.LOGOUT, {
      walletAddress: session.walletAddress,
      sessionId,
    });
  }
  return { ok: true };
}

export async function getMeFromSession(sessionId) {
  const ctx = await resolveSession(sessionId);
  return {
    user: {
      id: ctx.userId,
      walletAddress: ctx.walletAddress,
      publicKey: ctx.walletAddress,
      role: ctx.role,
      roles: ctx.roles,
      status: ctx.status,
      verificationStatus: ctx.verificationStatus,
      permissions: ctx.permissions,
    },
    sessionId: ctx.sessionId,
    expiresAt: ctx.expiresAt,
  };
}
