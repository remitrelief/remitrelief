import { AppError, ErrorCodes } from "../lib/errors.js";
import { Roles, normalizeRoles } from "../auth/roles.js";
import { auditRepo, usersRepo, verificationRepo } from "../repositories/index.js";

const ALLOWED_ROLES = new Set([Roles.NGO, Roles.RECIPIENT]);
const REVIEW_STATUSES = new Set(["VERIFIED", "REJECTED"]);
const ADMIN_SET_STATUSES = new Set(["SUSPENDED", "VERIFIED", "UNVERIFIED"]);
const STATEMENT_MIN = 20;
const STATEMENT_MAX = 2000;
const NOTE_MAX = 1000;
const EVIDENCE_MAX = 5;

function boundedText(value, field, max) {
  const text = String(value || "").trim();
  if (text.length > max) {
    throw new AppError(ErrorCodes.VERIFICATION_INVALID, `${field} must be at most ${max} characters`);
  }
  return text;
}

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
  const statement = boundedText(input.statement, "statement", STATEMENT_MAX);
  if (statement.length < STATEMENT_MIN) {
    throw new AppError(
      ErrorCodes.VERIFICATION_INVALID,
      `statement must be at least ${STATEMENT_MIN} characters`
    );
  }
  const rawEvidence = Array.isArray(input.evidenceUrls) ? input.evidenceUrls : [];
  if (rawEvidence.length > EVIDENCE_MAX) {
    throw new AppError(
      ErrorCodes.VERIFICATION_INVALID,
      `At most ${EVIDENCE_MAX} evidence URLs are allowed`
    );
  }
  const evidenceUrls = rawEvidence
    .map((url, index) => optionalHttpUrl(url, `evidenceUrls[${index}]`))
    .filter(Boolean);

  const user = await usersRepo.findById(actor.id);
  if (user?.verificationStatus === "SUSPENDED") {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "Your account is suspended; contact an administrator"
    );
  }
  if (user?.verificationStatus === "VERIFIED" && (user.roles || []).includes(requestedRole)) {
    throw new AppError(ErrorCodes.VERIFICATION_INVALID, "Already verified for this role");
  }

  const existingPending = (await verificationRepo.list({ userId: actor.id, status: "PENDING" }))[0];
  if (existingPending) {
    throw new AppError(
      ErrorCodes.VERIFICATION_INVALID,
      "You already have a pending verification request"
    );
  }

  // A verified user applying for an additional role keeps their current access meanwhile.
  if (user?.verificationStatus !== "VERIFIED") {
    await usersRepo.setVerificationStatus(actor.id, "PENDING");
  }
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
  const reviewNote = boundedText(input.reviewNote || input.note, "reviewNote", NOTE_MAX) || null;

  const updated = await verificationRepo.update(existing.id, {
    status: next,
    reviewNote,
    reviewedById: actor.id,
    reviewedAt: new Date().toISOString(),
  });

  const subject = await usersRepo.findById(existing.userId);
  const subjectStatus = subject?.verificationStatus;
  // Suspension wins: the request is closed but the account stays suspended.
  if (subjectStatus !== "SUSPENDED") {
    if (next === "VERIFIED") {
      const wallet = subject?.walletAddress || subject?.publicKey || existing.walletAddress;
      if (wallet) {
        await usersRepo.addRole(wallet, existing.requestedRole);
      }
      await usersRepo.setVerificationStatus(existing.userId, "VERIFIED");
    } else if (subjectStatus !== "VERIFIED") {
      await usersRepo.setVerificationStatus(existing.userId, "REJECTED");
    }
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

/**
 * ADMIN sets a user's verification status directly by wallet address
 * (suspend, reinstate, or reset). Admins cannot change their own status.
 */
export async function setUserVerificationStatusByAdmin(walletAddress, input, actor) {
  if (!isAdmin(actor)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required");
  }
  const status = String(input.status || "").toUpperCase();
  if (!ADMIN_SET_STATUSES.has(status)) {
    throw new AppError(
      ErrorCodes.VERIFICATION_INVALID,
      "status must be SUSPENDED, VERIFIED, or UNVERIFIED"
    );
  }
  const reason = boundedText(input.reason, "reason", NOTE_MAX) || null;
  const user = await usersRepo.getByPublicKey(String(walletAddress || "").trim());
  if (!user) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "User not found");
  }
  if (user.id === actor.id) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admins cannot change their own verification status");
  }
  if ((user.roles || []).includes(Roles.ADMIN)) {
    throw new AppError(
      ErrorCodes.FORBIDDEN,
      "Admin accounts are managed through ADMIN_PUBLIC_KEYS, not verification status"
    );
  }

  await usersRepo.setVerificationStatus(user.id, status);
  await auditRepo.create({
    userId: actor.id,
    action: "USER_VERIFICATION_STATUS_SET",
    resourceType: "User",
    resourceId: user.id,
    metadata: { status, previousStatus: user.verificationStatus || "UNVERIFIED", reason },
  });
  const updated = await usersRepo.findById(user.id);
  return {
    id: updated.id,
    walletAddress: updated.walletAddress || updated.publicKey,
    roles: updated.roles || [],
    verificationStatus: updated.verificationStatus,
  };
}
