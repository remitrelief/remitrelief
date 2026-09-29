import { AppError, ErrorCodes } from "../lib/errors.js";
import { Roles, normalizeRoles } from "../auth/roles.js";
import { auditRepo, usersRepo, verificationRepo } from "../repositories/index.js";

const ALLOWED_ROLES = new Set([Roles.NGO, Roles.RECIPIENT]);
const REVIEW_STATUSES = new Set(["VERIFIED", "REJECTED"]);

function isAdmin(actor) {
  return Boolean(actor?.roles?.includes(Roles.ADMIN));
}

function optionalHttpUrl(value, field) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (!["https:", "http:"].includes(url.protocol)) {
      throw new Error("unsupported protocol");
    }
    return url.toString();
  } catch {
    throw new AppError(ErrorCodes.VERIFICATION_INVALID, `${field} must be a valid HTTP(S) URL`);
  }
}

/**
 * ADMIN always passes. Env-allowlisted or reviewed NGO/RECIPIENT must be VERIFIED.
 */
export async function assertActorVerified(actor, { action = "this action" } = {}) {
  if (!actor?.id && !actor?.walletAddress) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required");
  }
  if (isAdmin(actor)) return actor;

  const user =
    (actor.id && (await usersRepo.findById(actor.id))) ||
    (actor.walletAddress && (await usersRepo.getByPublicKey(actor.walletAddress))) ||
    (actor.publicKey && (await usersRepo.getByPublicKey(actor.publicKey)));

  const roles = normalizeRoles(user?.roles || actor.roles || []);
  const status = String(user?.verificationStatus || "UNVERIFIED").toUpperCase();

  if (roles.includes(Roles.NGO) || roles.includes(Roles.RECIPIENT)) {
    if (status === "VERIFIED") return { ...actor, verificationStatus: status, roles };
    throw new AppError(
      ErrorCodes.VERIFICATION_REQUIRED,
      `Verified identity status is required for ${action} (status gating only — not full KYC)`
    );
  }

  throw new AppError(
    ErrorCodes.ROLE_REQUIRED,
    `NGO or RECIPIENT role with verified status is required for ${action}`
  );
}

export async function getMyVerification(actor) {
  if (!actor?.id) throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required");
  const user = await usersRepo.findById(actor.id);
  const requests = await verificationRepo.list({ userId: actor.id });
  return {
    verificationStatus: user?.verificationStatus || "UNVERIFIED",
    roles: user?.roles || actor.roles || [],
    requests,
  };
}

export async function submitVerificationRequest(input, actor) {
  if (!actor?.id) throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required");
  const requestedRole = String(input.requestedRole || "NGO").toUpperCase();
  if (!ALLOWED_ROLES.has(requestedRole)) {
    throw new AppError(ErrorCodes.VERIFICATION_INVALID, "requestedRole must be NGO or RECIPIENT");
  }
  const statement = String(input.statement || "").trim();
  if (statement.length < 20) {
    throw new AppError(
      ErrorCodes.VERIFICATION_INVALID,
      "statement must be at least 20 characters"
    );
  }
  const evidenceUrls = (Array.isArray(input.evidenceUrls) ? input.evidenceUrls : [])
    .map((url, index) => optionalHttpUrl(url, `evidenceUrls[${index}]`))
    .filter(Boolean)
    .slice(0, 5);

  const existingPending = (await verificationRepo.list({ userId: actor.id, status: "PENDING" }))[0];
  if (existingPending) {
    throw new AppError(
      ErrorCodes.VERIFICATION_INVALID,
      "You already have a pending verification request"
    );
  }

  const user = await usersRepo.findById(actor.id);
  if (user?.verificationStatus === "VERIFIED" && (user.roles || []).includes(requestedRole)) {
    throw new AppError(ErrorCodes.VERIFICATION_INVALID, "Already verified for this role");
  }

  await usersRepo.setVerificationStatus(actor.id, "PENDING");
  const request = await verificationRepo.create({
    userId: actor.id,
    walletAddress: actor.walletAddress || actor.publicKey || null,
    requestedRole,
    statement,
    evidenceUrls,
  });
  await auditRepo.create({
    userId: actor.id,
    action: "VERIFICATION_REQUESTED",
    resourceType: "VerificationRequest",
    resourceId: request.id,
    metadata: { requestedRole },
  });
  return request;
}

export async function listPendingVerifications(actor) {
  if (!isAdmin(actor)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required");
  }
  return verificationRepo.list({ status: "PENDING" });
}

export async function reviewVerificationRequest(id, input, actor) {
  if (!isAdmin(actor)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required");
  }
  const existing = await verificationRepo.findById(id);
  if (!existing) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Verification request not found");
  }
  if (existing.status !== "PENDING") {
    throw new AppError(ErrorCodes.VERIFICATION_INVALID, "Request is not pending");
  }
  const next = String(input.status || "").toUpperCase();
  if (!REVIEW_STATUSES.has(next)) {
    throw new AppError(ErrorCodes.VERIFICATION_INVALID, "status must be VERIFIED or REJECTED");
  }
  const reviewNote = String(input.reviewNote || input.note || "").trim() || null;

  const updated = await verificationRepo.update(existing.id, {
    status: next,
    reviewNote,
    reviewedById: actor.id,
    reviewedAt: new Date().toISOString(),
  });

  if (next === "VERIFIED") {
    const user = await usersRepo.findById(existing.userId);
    const wallet = user?.walletAddress || user?.publicKey || existing.walletAddress;
    if (wallet) {
      await usersRepo.addRole(wallet, existing.requestedRole);
    }
    await usersRepo.setVerificationStatus(existing.userId, "VERIFIED");
  } else {
    await usersRepo.setVerificationStatus(existing.userId, "REJECTED");
  }

  await auditRepo.create({
    userId: actor.id,
    action: "VERIFICATION_REVIEWED",
    resourceType: "VerificationRequest",
    resourceId: existing.id,
    metadata: { status: next, subjectUserId: existing.userId },
  });
  return updated;
}
