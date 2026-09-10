import { AppError, ErrorCodes } from "../lib/errors.js";

export const CampaignStatuses = Object.freeze([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "ACTIVE",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "CLOSED",
  "EXPIRED",
]);

export const CampaignCategories = Object.freeze([
  "MEDICAL",
  "EDUCATION",
  "FOOD",
  "HOUSING",
  "EMERGENCY",
  "DISASTER",
  "FAMILY",
  "COMMUNITY",
]);

export const CampaignCurrencies = Object.freeze(["USDC", "USD", "NGN", "EUR", "GBP"]);
export const CampaignVisibilities = Object.freeze(["PUBLIC", "UNLISTED", "PRIVATE"]);

export const CampaignTransitions = Object.freeze({
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "EXPIRED", "CANCELLED"],
  COMPLETED: ["CLOSED"],
  REJECTED: [],
  CANCELLED: [],
  CLOSED: [],
  EXPIRED: [],
});

export function assertCampaignTransition(currentStatus, nextStatus) {
  if (!CampaignStatuses.includes(nextStatus)) {
    throw new AppError(ErrorCodes.CAMPAIGN_INVALID_STATE, "Unknown campaign status");
  }
  if (!(CampaignTransitions[currentStatus] || []).includes(nextStatus)) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_INVALID_STATE,
      `Campaign cannot transition from ${currentStatus} to ${nextStatus}`
    );
  }
}

export function getEffectiveCampaignStatus(campaign, now = new Date()) {
  if (
    campaign?.status === "ACTIVE" &&
    campaign.deadline &&
    new Date(campaign.deadline).getTime() <= now.getTime()
  ) {
    return "EXPIRED";
  }
  return campaign?.status;
}

export function slugifyCampaignTitle(title) {
  return String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

export function campaignCapabilities(campaign, actor) {
  const isAdmin = actor?.roles?.includes("ADMIN");
  const isOwner = actor?.id && actor.id === campaign.ownerId;
  const canManageOrganization = Boolean(campaign.organizationAccess);
  const canEdit =
    isAdmin ||
    ((isOwner || canManageOrganization) && ["DRAFT"].includes(campaign.status));
  return {
    canEdit,
    canSubmit: Boolean(isOwner && campaign.status === "DRAFT"),
    canDelete: Boolean((isOwner || isAdmin) && campaign.status === "DRAFT"),
    canPostUpdate: Boolean(
      isAdmin ||
        ((isOwner || canManageOrganization) &&
          ["APPROVED", "ACTIVE", "COMPLETED"].includes(campaign.status))
    ),
    canModerate: Boolean(isAdmin),
  };
}
