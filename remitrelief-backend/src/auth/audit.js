import { logger } from "../lib/logger.js";

export const AuditEvents = Object.freeze({
  AUTH_CHALLENGE_CREATED: "AUTH_CHALLENGE_CREATED",
  AUTH_SUCCESS: "AUTH_SUCCESS",
  AUTH_FAILURE: "AUTH_FAILURE",
  SESSION_CREATED: "SESSION_CREATED",
  SESSION_REVOKED: "SESSION_REVOKED",
  LOGOUT: "LOGOUT",
  AUTHORIZATION_DENIED: "AUTHORIZATION_DENIED",
  USER_CREATED: "USER_CREATED",
  ROLE_CHANGED: "ROLE_CHANGED",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_DEACTIVATED: "USER_DEACTIVATED",
  CAMPAIGN_CREATED: "CAMPAIGN_CREATED",
  CAMPAIGN_UPDATED: "CAMPAIGN_UPDATED",
  CAMPAIGN_SUBMITTED: "CAMPAIGN_SUBMITTED",
  CAMPAIGN_REVIEW_STARTED: "CAMPAIGN_REVIEW_STARTED",
  CAMPAIGN_APPROVED: "CAMPAIGN_APPROVED",
  CAMPAIGN_REJECTED: "CAMPAIGN_REJECTED",
  CAMPAIGN_ACTIVATED: "CAMPAIGN_ACTIVATED",
  CAMPAIGN_COMPLETED: "CAMPAIGN_COMPLETED",
  CAMPAIGN_CANCELLED: "CAMPAIGN_CANCELLED",
  CAMPAIGN_CLOSED: "CAMPAIGN_CLOSED",
  MILESTONE_CREATED: "MILESTONE_CREATED",
  MILESTONE_UPDATED: "MILESTONE_UPDATED",
  CAMPAIGN_UPDATE_CREATED: "CAMPAIGN_UPDATE_CREATED",
  CAMPAIGN_UPDATE_PUBLISHED: "CAMPAIGN_UPDATE_PUBLISHED",
});

/**
 * Persist auth audit events. Uses auditRepo when available; always logs safely.
 */
export async function recordAuthAudit(event, meta = {}) {
  const safe = {
    event,
    at: new Date().toISOString(),
    walletAddress: meta.walletAddress || null,
    sessionId: meta.sessionId ? String(meta.sessionId).slice(0, 8) + "…" : null,
    reason: meta.reason || null,
    path: meta.path || null,
    role: meta.role || null,
  };
  logger.info("auth.audit", safe);

  try {
    const { auditRepo } = await import("../repositories/index.js");
    if (auditRepo?.create) {
      await auditRepo.create({
        userId: meta.userId || null,
        action: event,
        resourceType: meta.resourceType || null,
        resourceId: meta.resourceId || null,
        ipAddress: meta.ipAddress || null,
        userAgent: meta.userAgent || null,
        metadata: {
          walletAddress: meta.walletAddress || null,
          reason: meta.reason || null,
          path: meta.path || null,
          role: meta.role || null,
        },
      });
    }
  } catch (err) {
    logger.debug("audit persist skipped", { reason: err.message });
  }

  return safe;
}
