import { AppError, ErrorCodes } from "../lib/errors.js";
import { normalizeMoney, sumMoney } from "../lib/money.js";
import {
  CampaignCategories,
  CampaignCurrencies,
  CampaignStatuses,
  CampaignVisibilities,
} from "../domain/campaign.js";

function cleanText(value, { field, min = 0, max, required = false }) {
  const text = String(value ?? "").trim();
  if (required && text.length < min) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, `${field} must be at least ${min} characters`);
  }
  if (text.length > max) {
    throw new AppError(ErrorCodes.INVALID_REQUEST, `${field} must be at most ${max} characters`);
  }
  return text;
}

function enumValue(value, allowed, code, field, fallback) {
  if (value == null || value === "") return fallback;
  const aliases = {
    RELIEF: "EMERGENCY",
    FLOOD: "DISASTER",
    WILDFIRE: "DISASTER",
    CYCLONE: "DISASTER",
    EARTHQUAKE: "DISASTER",
  };
  const raw = String(value).toUpperCase();
  const normalized = aliases[raw] || raw;
  if (!allowed.includes(normalized)) {
    throw new AppError(code, `${field} must be one of: ${allowed.join(", ")}`);
  }
  return normalized;
}

function optionalUrl(value, field) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("unsupported protocol");
    return url.toString();
  } catch {
    throw new AppError(ErrorCodes.INVALID_REQUEST, `${field} must be a valid HTTP(S) URL`);
  }
}

export function validateMilestones(items = [], { requireTotal, goalAmount } = {}) {
  if (!Array.isArray(items)) {
    throw new AppError(ErrorCodes.MILESTONE_INVALID, "milestones must be an array");
  }
  if (items.length > 20) {
    throw new AppError(ErrorCodes.MILESTONE_INVALID, "a campaign may have at most 20 milestones");
  }
  const milestones = items.map((item, sequence) => ({
    id: item.id || undefined,
    title: cleanText(item.title ?? item.label, {
      field: `milestones[${sequence}].title`,
      min: 3,
      max: 120,
      required: true,
    }),
    description: cleanText(item.description, {
      field: `milestones[${sequence}].description`,
      max: 1000,
    }),
    targetAmount: normalizeMoney(
      item.targetAmount ?? item.amount,
      `milestones[${sequence}].targetAmount`
    ),
    sequence,
  }));
  if (requireTotal && milestones.length === 0) {
    throw new AppError(ErrorCodes.MILESTONE_INVALID, "at least one milestone is required");
  }
  if (requireTotal && sumMoney(milestones.map((item) => item.targetAmount)) !== normalizeMoney(goalAmount)) {
    throw new AppError(
      ErrorCodes.MILESTONE_INVALID,
      "milestone target amounts must equal the campaign goal"
    );
  }
  return milestones;
}

export function validateCampaignInput(input = {}, { partial = false } = {}) {
  const output = {};
  if (!partial || input.title != null || input.name != null) {
    output.title = cleanText(input.title ?? input.name, {
      field: "title",
      min: partial ? 0 : 5,
      max: 120,
      required: !partial,
    });
  }
  if (!partial || input.shortDescription != null) {
    output.shortDescription = cleanText(input.shortDescription, {
      field: "shortDescription",
      max: 240,
    });
  }
  if (!partial || input.description != null) {
    output.description = cleanText(input.description, {
      field: "description",
      max: 10_000,
    });
  }
  if (!partial || input.location != null) {
    output.location = cleanText(input.location, { field: "location", max: 120 });
  }
  if (!partial || input.category != null) {
    output.category = enumValue(
      input.category,
      CampaignCategories,
      ErrorCodes.CAMPAIGN_INVALID_CATEGORY,
      "category",
      "EMERGENCY"
    );
  }
  if (!partial || input.goalAmount != null || input.goal != null) {
    output.goalAmount = normalizeMoney(input.goalAmount ?? input.goal, "goalAmount");
  }
  if (!partial || input.currency != null) {
    output.currency = enumValue(
      input.currency,
      CampaignCurrencies,
      ErrorCodes.CAMPAIGN_INVALID_CURRENCY,
      "currency",
      "USDC"
    );
  }
  if (!partial || input.visibility != null) {
    output.visibility = enumValue(
      input.visibility,
      CampaignVisibilities,
      ErrorCodes.INVALID_REQUEST,
      "visibility",
      "PUBLIC"
    );
  }
  if (!partial || input.deadline != null) {
    if (!input.deadline) output.deadline = null;
    else {
      const deadline = new Date(input.deadline);
      if (Number.isNaN(deadline.getTime())) {
        throw new AppError(ErrorCodes.CAMPAIGN_INVALID_DEADLINE, "deadline must be a valid date");
      }
      output.deadline = deadline.toISOString();
    }
  }
  if (input.recipientId !== undefined) output.recipientId = input.recipientId || null;
  if (input.organizationId !== undefined) output.organizationId = input.organizationId || null;
  if (input.coverImage !== undefined) output.coverImage = optionalUrl(input.coverImage, "coverImage");
  if (input.milestones !== undefined) output.milestones = validateMilestones(input.milestones);
  return output;
}

export function validateCampaignForSubmission(campaign) {
  cleanText(campaign.title ?? campaign.name, {
    field: "title",
    min: 5,
    max: 120,
    required: true,
  });
  cleanText(campaign.description, {
    field: "description",
    min: 30,
    max: 10_000,
    required: true,
  });
  normalizeMoney(campaign.goalAmount ?? campaign.goal, "goalAmount");
  if (!campaign.recipientId) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_RECIPIENT_NOT_FOUND,
      "a registered recipient is required"
    );
  }
  if (!campaign.deadline || new Date(campaign.deadline).getTime() <= Date.now()) {
    throw new AppError(
      ErrorCodes.CAMPAIGN_INVALID_DEADLINE,
      "deadline must be in the future"
    );
  }
  validateMilestones(
    (campaign.milestones || []).filter((milestone) => milestone.status !== "CANCELLED"),
    {
    requireTotal: true,
    goalAmount: campaign.goalAmount ?? campaign.goal,
    }
  );
}

export function validateCampaignQuery(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 12));
  const search = String(query.search ?? query.q ?? "").trim().slice(0, 100);
  const sort = ["newest", "oldest", "ending_soon", "goal_low", "goal_high", "progress"].includes(
    query.sort
  )
    ? query.sort
    : "newest";
  return {
    page,
    limit,
    search,
    sort,
    category: query.category
      ? enumValue(
          query.category,
          CampaignCategories,
          ErrorCodes.CAMPAIGN_INVALID_CATEGORY,
          "category"
        )
      : undefined,
    status: query.status
      ? enumValue(
          query.status,
          CampaignStatuses,
          ErrorCodes.CAMPAIGN_INVALID_STATE,
          "status"
        )
      : undefined,
  };
}

export function validateCampaignUpdateInput(input = {}) {
  return {
    title: cleanText(input.title, {
      field: "title",
      min: 3,
      max: 120,
      required: true,
    }),
    content: cleanText(input.content, {
      field: "content",
      min: 10,
      max: 10_000,
      required: true,
    }),
    publish: Boolean(input.publish),
  };
}

export function validateCampaignMediaInput(input = {}) {
  const type = enumValue(
    input.type,
    ["IMAGE", "VIDEO", "DOCUMENT"],
    ErrorCodes.INVALID_REQUEST,
    "type",
    "IMAGE"
  );
  return {
    url: optionalUrl(input.url, "url"),
    type,
    altText: cleanText(input.altText, { field: "altText", max: 240 }),
    sortOrder: Math.max(0, Math.min(1000, Number.parseInt(input.sortOrder, 10) || 0)),
    isCover: Boolean(input.isCover),
  };
}
