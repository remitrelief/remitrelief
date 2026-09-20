import { AppError, ErrorCodes } from "../lib/errors.js";
import { auditRepo, organizationsRepo } from "../repositories/index.js";
import { slugifyCampaignTitle } from "../domain/campaign.js";

function isAdmin(actor) {
  return Boolean(actor?.roles?.includes("ADMIN"));
}

function cleanText(value, { field, min = 1, max = 200, required = true } = {}) {
  const text = String(value ?? "").trim();
  if (required && text.length < min) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, `${field} must be at least ${min} characters`);
  }
  if (text.length > max) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, `${field} must be at most ${max} characters`);
  }
  return text;
}

export async function createOrganization(input, actor) {
  if (!actor?.id) throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required");
  const name = cleanText(input.name, { field: "name", min: 3, max: 120 });
  const description = cleanText(input.description || "", {
    field: "description",
    min: 0,
    max: 2000,
    required: false,
  });
  const slugBase = slugifyCampaignTitle(input.slug || name) || `org-${Date.now()}`;
  let slug = slugBase;
  let attempt = 0;
  while (await organizationsRepo.findBySlug(slug)) {
    attempt += 1;
    slug = `${slugBase}-${attempt}`;
    if (attempt > 20) {
      throw new AppError(ErrorCodes.DUPLICATE_RESOURCE, "Could not allocate organization slug");
    }
  }

  const organization = await organizationsRepo.create({
    name,
    slug,
    description: description || null,
    walletAddress: actor.walletAddress || null,
    status: "PENDING",
  });
  await organizationsRepo.addMember({
    organizationId: organization.id,
    userId: actor.id,
    role: "OWNER",
    status: "ACTIVE",
  });
  await auditRepo.create({
    userId: actor.id,
    action: "ORG_CREATED",
    resourceType: "Organization",
    resourceId: organization.id,
    metadata: { name, status: organization.status },
  });
  return { ...organization, membershipRole: "OWNER" };
}

export async function listMyOrganizations(actor) {
  if (!actor?.id) throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required");
  return organizationsRepo.listForUser(actor.id);
}

export async function listPendingOrganizations(actor) {
  if (!isAdmin(actor)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required");
  }
  return organizationsRepo.list({ status: "PENDING" });
}

export async function setOrganizationStatus(id, status, actor) {
  if (!isAdmin(actor)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required");
  }
  const next = String(status || "").toUpperCase();
  if (!["PENDING", "VERIFIED", "SUSPENDED", "REJECTED"].includes(next)) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, "Invalid organization status");
  }
  const existing = await organizationsRepo.findById(id);
  if (!existing) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Organization not found");
  }
  const updated = await organizationsRepo.updateStatus(existing.id, next);
  await auditRepo.create({
    userId: actor.id,
    action: "ORG_STATUS_UPDATED",
    resourceType: "Organization",
    resourceId: existing.id,
    metadata: { from: existing.status, to: next },
  });
  return updated;
}
