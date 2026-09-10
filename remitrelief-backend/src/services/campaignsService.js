import { loadConfig } from "../config.js";
import { AppError, ErrorCodes } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import {
  auditRepo,
  campaignMediaRepo,
  campaignsRepo,
  campaignUpdatesRepo,
  milestonesRepo,
  organizationsRepo,
  statsRepo,
  usersRepo,
} from "../repositories/index.js";
import { getEscrowBalance, getMilestones } from "../blockchain/soroban/index.js";
import {
  assertCampaignTransition,
  campaignCapabilities,
  getEffectiveCampaignStatus,
} from "../domain/campaign.js";
import {
  validateCampaignForSubmission,
  validateCampaignInput,
  validateCampaignMediaInput,
  validateCampaignQuery,
  validateCampaignUpdateInput,
  validateMilestones,
} from "../validators/campaignValidator.js";
import { mediaStorageService } from "./mediaStorageService.js";

function enrichFromChain(campaign, onChainBalance, milestones) {
  const enriched = { ...campaign };
  if (onChainBalance != null) {
    enriched.onChainBalance = onChainBalance;
    enriched.onChainBalanceUsd = Number(onChainBalance) / 1e7;
  }
  if (Array.isArray(milestones) && milestones.length) {
    enriched.milestones = milestones.map((m, index) => ({
      index,
      amount: m.amount,
      amountUsd: Number(m.amount) / 1e7,
      verified: Boolean(m.verified),
      released: Boolean(m.released),
      label: campaign.milestoneLabels?.[index]?.label || `Milestone ${index + 1}`,
    }));
    enriched.milestonesVerified = milestones.filter((m) => m.verified).length;
    enriched.milestonesTotal = milestones.length;
  } else if (campaign.milestoneLabels?.length) {
    enriched.milestones = campaign.milestoneLabels.map((m) => ({
      index: m.index,
      amount: m.amount * 1e7,
      amountUsd: m.amount,
      verified: m.index < campaign.milestonesVerified,
      released: false,
      label: m.label,
    }));
  }
  return enriched;
}

function isAdmin(actor) {
  return Boolean(actor?.roles?.includes("ADMIN"));
}

async function hasOrganizationAccess(organizationId, actor) {
  if (!organizationId || !actor?.id) return false;
  if (isAdmin(actor)) return true;
  const members = await organizationsRepo.listMembers(organizationId);
  return members.some(
    (member) =>
      member.userId === actor.id &&
      member.status === "ACTIVE" &&
      ["OWNER", "MANAGER"].includes(member.role)
  );
}

async function getManagedCampaign(id, actor) {
  const campaign = await campaignsRepo.getById(id);
  if (!campaign) throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "Campaign not found");
  const organizationAccess = await hasOrganizationAccess(campaign.organizationId, actor);
  const allowed = isAdmin(actor) || campaign.ownerId === actor?.id || organizationAccess;
  if (!allowed) {
    throw new AppError(ErrorCodes.CAMPAIGN_ACCESS_DENIED, "Campaign access denied");
  }
  return { ...campaign, organizationAccess };
}

async function auditCampaign(action, campaign, actor, metadata = {}) {
  await auditRepo.create({
    userId: actor?.id || null,
    action,
    resourceType: "Campaign",
    resourceId: campaign.id,
    metadata,
  });
}

function publicView(campaign, actor) {
  const capabilities = campaignCapabilities(campaign, actor);
  const canManage = capabilities.canEdit || capabilities.canModerate || capabilities.canSubmit;
  const { rejectionReason, ...safe } = campaign;
  return {
    ...safe,
    ...(canManage ? { rejectionReason } : {}),
    effectiveStatus: getEffectiveCampaignStatus(campaign),
    capabilities,
  };
}

export async function listCampaigns(filters = {}) {
  const query = validateCampaignQuery(filters);
  const result = await campaignsRepo.list({ ...query, publicOnly: true });
  return {
    data: result.items.map((campaign) => publicView(campaign, null)),
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
}

export async function listMyCampaigns(filters = {}, actor) {
  const query = validateCampaignQuery(filters);
  const result = await campaignsRepo.list({ ...query, ownerId: actor.id });
  return {
    data: result.items.map((campaign) => publicView(campaign, actor)),
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
}

export async function getStats() {
  return statsRepo.get();
}

export async function createCampaign(input, actor = {}) {
  const walletAddress = actor.walletAddress || actor.publicKey;
  const owner = actor.id
    ? await usersRepo.findById(actor.id)
    : await usersRepo.getByPublicKey(walletAddress);
  if (!owner) throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required");
  const validated = validateCampaignInput(input);
  const recipientId = validated.recipientId || owner.id;
  if (!(await usersRepo.findById(recipientId))) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_RECIPIENT_NOT_FOUND,
      "Campaign recipient was not found"
    );
  }
  if (validated.organizationId) {
    const organization = await organizationsRepo.findById(validated.organizationId);
    if (
      !organization ||
      !(await hasOrganizationAccess(validated.organizationId, { ...actor, id: owner.id }))
    ) {
      throw new AppError(
        ErrorCodes.CAMPAIGN_ORGANIZATION_ACCESS_DENIED,
        "You cannot associate this organization"
      );
    }
  }
  const campaign = await campaignsRepo.create({
    ...validated,
    ownerId: owner.id,
    ownerWallet: owner.walletAddress,
    recipientId,
  });
  await auditCampaign("CAMPAIGN_CREATED", campaign, { ...actor, id: owner.id });
  return publicView(campaign, { ...actor, id: owner.id });
}

export async function updateCampaign(id, input, actor) {
  const campaign = await getManagedCampaign(id, actor);
  const allowed = campaignCapabilities(campaign, actor).canEdit;
  if (!allowed) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_NOT_EDITABLE,
      "Only draft campaign fields can be edited"
    );
  }
  const validated = validateCampaignInput(input, { partial: true });
  if (campaign.status !== "DRAFT") {
    const safeModerationFields = new Set([
      "shortDescription",
      "description",
      "coverImage",
      "visibility",
    ]);
    const protectedFields = Object.keys(validated).filter(
      (field) => !safeModerationFields.has(field)
    );
    if (!isAdmin(actor) || protectedFields.length) {
      throw new AppError(
        ErrorCodes.CAMPAIGN_NOT_EDITABLE,
        "Critical campaign fields are locked after draft submission"
      );
    }
  }
  if (validated.organizationId) {
    const organization = await organizationsRepo.findById(validated.organizationId);
    if (!organization || !(await hasOrganizationAccess(validated.organizationId, actor))) {
      throw new AppError(
        ErrorCodes.CAMPAIGN_ORGANIZATION_ACCESS_DENIED,
        "You cannot associate this organization"
      );
    }
  }
  if (
    validated.recipientId &&
    !(await usersRepo.findById(validated.recipientId))
  ) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_RECIPIENT_NOT_FOUND,
      "Campaign recipient was not found"
    );
  }
  const updated = await campaignsRepo.update(campaign.id, validated);
  await auditCampaign("CAMPAIGN_UPDATED", updated, actor, {
    fields: Object.keys(validated),
  });
  return publicView(updated, actor);
}

export async function submitCampaign(id, actor) {
  const campaign = await getManagedCampaign(id, actor);
  if (campaign.ownerId !== actor.id && !isAdmin(actor)) {
    throw new AppError(ErrorCodes.CAMPAIGN_ACCESS_DENIED, "Only the owner may submit");
  }
  assertCampaignTransition(campaign.status, "SUBMITTED");
  validateCampaignForSubmission(campaign);
  const updated = await campaignsRepo.transition(campaign.id, "SUBMITTED");
  await auditCampaign("CAMPAIGN_SUBMITTED", updated, actor);
  return publicView(updated, actor);
}

export async function transitionCampaign(id, nextStatus, actor, reason) {
  if (!isAdmin(actor)) {
    throw new AppError(ErrorCodes.CAMPAIGN_ACCESS_DENIED, "Admin access required");
  }
  const campaign = await campaignsRepo.getById(id);
  if (!campaign) throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "Campaign not found");
  assertCampaignTransition(campaign.status, nextStatus);
  if (nextStatus === "REJECTED" && String(reason || "").trim().length < 5) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "A rejection reason is required");
  }
  if (
    nextStatus === "ACTIVE" &&
    (!campaign.deadline || new Date(campaign.deadline).getTime() <= Date.now())
  ) {
    throw new AppError(ErrorCodes.CAMPAIGN_INVALID_DEADLINE, "Deadline must be in the future");
  }
  const updated = await campaignsRepo.transition(
    campaign.id,
    nextStatus,
    nextStatus === "REJECTED" ? String(reason).trim().slice(0, 1000) : null
  );
  const actions = {
    UNDER_REVIEW: "CAMPAIGN_REVIEW_STARTED",
    APPROVED: "CAMPAIGN_APPROVED",
    REJECTED: "CAMPAIGN_REJECTED",
    ACTIVE: "CAMPAIGN_ACTIVATED",
    COMPLETED: "CAMPAIGN_COMPLETED",
    CANCELLED: "CAMPAIGN_CANCELLED",
    CLOSED: "CAMPAIGN_CLOSED",
    EXPIRED: "CAMPAIGN_EXPIRED",
  };
  await auditCampaign(actions[nextStatus], updated, actor, {
    ...(nextStatus === "REJECTED" ? { reason: updated.rejectionReason } : {}),
  });
  return publicView(updated, actor);
}

export async function deleteDraftCampaign(id, actor) {
  const campaign = await getManagedCampaign(id, actor);
  if (!campaignCapabilities(campaign, actor).canDelete || campaign.donationCount > 0) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_NOT_EDITABLE,
      "Only donation-free drafts may be deleted"
    );
  }
  await campaignsRepo.deleteDraft(campaign.id);
  await auditCampaign("CAMPAIGN_DRAFT_DELETED", campaign, actor);
}

export async function addCampaignMilestone(id, input, actor) {
  const campaign = await getManagedCampaign(id, actor);
  if (!campaignCapabilities(campaign, actor).canEdit) {
    throw new AppError(ErrorCodes.CAMPAIGN_NOT_EDITABLE, "Milestones are locked");
  }
  const [validated] = validateMilestones([input]);
  validated.sequence = input.sequence ?? campaign.milestones.length;
  if (campaign.milestones.some((item) => item.sequence === validated.sequence)) {
    throw new AppError(
      ErrorCodes.MILESTONE_SEQUENCE_CONFLICT,
      "Milestone sequence already exists"
    );
  }
  const milestone = await milestonesRepo.create(campaign.id, validated);
  await auditCampaign("MILESTONE_CREATED", campaign, actor, { milestoneId: milestone.id });
  return milestone;
}

export async function updateCampaignMilestone(campaignId, milestoneId, input, actor) {
  const campaign = await getManagedCampaign(campaignId, actor);
  if (!campaignCapabilities(campaign, actor).canEdit) {
    throw new AppError(ErrorCodes.CAMPAIGN_NOT_EDITABLE, "Milestones are locked");
  }
  const existing = await milestonesRepo.findById(milestoneId);
  if (!existing || existing.campaignId !== campaign.id) {
    throw new AppError(ErrorCodes.MILESTONE_NOT_FOUND, "Milestone not found");
  }
  const [validated] = validateMilestones([{ ...existing, ...input }]);
  if (input.sequence !== undefined) validated.sequence = Number(input.sequence);
  if (input.status !== undefined) {
    const status = String(input.status).toUpperCase();
    if (!["PENDING", "CANCELLED"].includes(status)) {
      throw new AppError(
        ErrorCodes.MILESTONE_INVALID,
        "Draft milestones may only be pending or cancelled"
      );
    }
    validated.status = status;
  }
  if (
    campaign.milestones.some(
      (item) => item.id !== milestoneId && item.sequence === validated.sequence
    )
  ) {
    throw new AppError(
      ErrorCodes.MILESTONE_SEQUENCE_CONFLICT,
      "Milestone sequence already exists"
    );
  }
  const milestone = await milestonesRepo.update(milestoneId, validated);
  await auditCampaign("MILESTONE_UPDATED", campaign, actor, { milestoneId });
  return milestone;
}

export async function createCampaignUpdate(id, input, actor) {
  const campaign = await getManagedCampaign(id, actor);
  if (!campaignCapabilities(campaign, actor).canPostUpdate) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_UPDATE_NOT_AUTHORIZED,
      "Campaign updates are not authorized"
    );
  }
  const validated = validateCampaignUpdateInput(input);
  const update = await campaignUpdatesRepo.create(campaign.id, actor.id, validated);
  await auditCampaign(
    validated.publish ? "CAMPAIGN_UPDATE_PUBLISHED" : "CAMPAIGN_UPDATE_CREATED",
    campaign,
    actor,
    { updateId: update.id }
  );
  return update;
}

export async function editCampaignUpdate(campaignId, updateId, input, actor) {
  const campaign = await getManagedCampaign(campaignId, actor);
  if (!campaignCapabilities(campaign, actor).canPostUpdate) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_UPDATE_NOT_AUTHORIZED,
      "Campaign updates are not authorized"
    );
  }
  const existing = await campaignUpdatesRepo.findById(updateId);
  if (!existing || existing.campaignId !== campaign.id) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Campaign update not found");
  }
  if (existing.status === "PUBLISHED" && !isAdmin(actor)) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_UPDATE_NOT_AUTHORIZED,
      "Published updates cannot be edited"
    );
  }
  const validated = validateCampaignUpdateInput(input);
  const update = await campaignUpdatesRepo.update(updateId, validated);
  await auditCampaign(
    validated.publish ? "CAMPAIGN_UPDATE_PUBLISHED" : "CAMPAIGN_UPDATE_UPDATED",
    campaign,
    actor,
    { updateId }
  );
  return update;
}

export async function listCampaignUpdates(id, actor) {
  const campaign = await campaignsRepo.getById(id);
  if (!campaign) throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "Campaign not found");
  const canManage =
    actor &&
    (isAdmin(actor) ||
      campaign.ownerId === actor.id ||
      (await hasOrganizationAccess(campaign.organizationId, actor)));
  return campaignUpdatesRepo.list(campaign.id, { publishedOnly: !canManage });
}

export async function addCampaignMedia(id, input, actor) {
  const campaign = await getManagedCampaign(id, actor);
  if (!campaignCapabilities(campaign, actor).canEdit) {
    throw new AppError(ErrorCodes.CAMPAIGN_MEDIA_NOT_AUTHORIZED, "Campaign media is locked");
  }
  const validated = validateCampaignMediaInput(input);
  const stored = await mediaStorageService.register(validated);
  const media = await campaignMediaRepo.create(campaign.id, stored);
  await auditCampaign("CAMPAIGN_MEDIA_CREATED", campaign, actor, { mediaId: media.id });
  return media;
}

export async function removeCampaignMedia(campaignId, mediaId, actor) {
  const campaign = await getManagedCampaign(campaignId, actor);
  if (!campaignCapabilities(campaign, actor).canEdit) {
    throw new AppError(ErrorCodes.CAMPAIGN_MEDIA_NOT_AUTHORIZED, "Campaign media is locked");
  }
  const media = await campaignMediaRepo.findById(mediaId);
  if (!media || media.campaignId !== campaign.id) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Campaign media not found");
  }
  await campaignMediaRepo.remove(mediaId);
  await auditCampaign("CAMPAIGN_MEDIA_REMOVED", campaign, actor, { mediaId });
}

export async function getCampaignDetail(id, actor = null) {
  const campaign = await campaignsRepo.getById(id);
  if (!campaign) {
    throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "Campaign not found");
  }
  const organizationAccess = actor
    ? await hasOrganizationAccess(campaign.organizationId, actor)
    : false;
  const canManage = Boolean(
    actor && (isAdmin(actor) || campaign.ownerId === actor.id || organizationAccess)
  );
  if (
    campaign.visibility === "PRIVATE" &&
    !canManage
  ) {
    throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "Campaign not found");
  }
  if (!canManage && !["ACTIVE", "COMPLETED"].includes(campaign.status)) {
    throw new AppError(ErrorCodes.CAMPAIGN_NOT_FOUND, "Campaign not found");
  }

  if (!campaign.escrowAddress) {
    return publicView({ ...campaign, organizationAccess }, actor);
  }

  if (!loadConfig().secrets.backendSignerSecret) {
    logger.warn("Skipping on-chain enrich — BACKEND_SIGNER_SECRET unset", { id });
    return publicView({ ...campaign, organizationAccess }, actor);
  }

  try {
    const [onChainBalance, milestones] = await Promise.all([
      getEscrowBalance(campaign.escrowAddress),
      getMilestones(campaign.escrowAddress),
    ]);
    const enriched = enrichFromChain(campaign, onChainBalance, milestones);
    if (Array.isArray(milestones) && milestones.length) {
      await campaignsRepo.setMilestonesVerified(campaign.id, enriched.milestonesVerified);
    }
    return publicView({ ...enriched, organizationAccess }, actor);
  } catch (err) {
    logger.warn("Could not read on-chain state", { id, reason: err.message });
    return publicView({ ...campaign, organizationAccess }, actor);
  }
}
