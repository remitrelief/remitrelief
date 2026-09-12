import { randomBytes } from "node:crypto";
import { getPrisma } from "../../database/prisma.js";
import { calculateProgress, sumMoney } from "../../lib/money.js";
import { slugifyCampaignTitle } from "../../domain/campaign.js";

const campaignInclude = {
  creator: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true } } } },
  recipient: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true } } } },
  organization: { select: { id: true, name: true, slug: true, status: true } },
  milestones: { orderBy: { index: "asc" } },
  media: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] },
  updates: {
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    include: {
      author: { select: { id: true, profile: { select: { displayName: true } } } },
    },
  },
};

function iso(value) {
  return value?.toISOString?.() || value || null;
}

function mapMilestone(row) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    sequence: row.index,
    index: row.index,
    title: row.label,
    label: row.label,
    description: row.description || "",
    targetAmount: String(row.amount),
    amount: String(row.amount),
    status: row.status,
    verified: Boolean(row.verified),
    released: Boolean(row.released),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapProfile(user, fallback) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.profile?.displayName || fallback,
    avatarUrl: user.profile?.avatarUrl || null,
  };
}

function mapUpdate(row) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    authorId: row.authorId,
    title: row.title,
    content: row.content,
    status: row.status,
    author: mapProfile(row.author, "Campaign organizer"),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    publishedAt: iso(row.publishedAt),
  };
}

function mapMedia(row) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    url: row.url,
    type: row.type,
    altText: row.altText || "",
    sortOrder: row.sortOrder,
    isCover: row.isCover,
    createdAt: iso(row.createdAt),
  };
}

function mapCampaign(row, progress = {}) {
  if (!row) return null;
  const goalAmount = String(row.goal);
  const raisedAmount = progress.raisedAmount ?? "0";
  const milestones = row.milestones?.map(mapMilestone) || [];
  return {
    id: row.id,
    slug: row.slug,
    title: row.name,
    name: row.name,
    shortDescription: row.shortDescription || "",
    description: row.description || "",
    location: row.location || "",
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    goalAmount,
    goal: Number(goalAmount),
    raisedAmount,
    raised: Number(raisedAmount),
    donationCount: progress.donationCount || 0,
    progressPercentage: calculateProgress(raisedAmount, goalAmount),
    currency: row.currency,
    deadline: iso(row.deadline),
    coverImage: row.coverImage || row.media?.find((item) => item.isCover)?.url || null,
    imageGradient: row.imageGradient,
    ownerId: row.createdByUserId,
    createdBy: row.createdByWallet,
    recipientId: row.recipientId,
    recipientName: row.recipientName,
    organizationId: row.organizationId,
    organizer: mapProfile(row.creator, "Campaign organizer"),
    recipient: mapProfile(row.recipient, row.recipientName || "Campaign beneficiary"),
    organization: row.organization || null,
    milestones,
    milestoneLabels: milestones.map((item) => ({
      index: item.sequence,
      label: item.title,
      amount: Number(item.targetAmount),
    })),
    milestonesTotal: milestones.length || row.milestonesTotal,
    milestonesVerified: milestones.filter((item) => item.status === "COMPLETED").length,
    updates: row.updates?.map(mapUpdate) || [],
    media: row.media?.map(mapMedia) || [],
    rejectionReason: row.rejectionReason,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    submittedAt: iso(row.submittedAt),
    approvedAt: iso(row.approvedAt),
    activatedAt: iso(row.activatedAt),
    completedAt: iso(row.completedAt),
    closedAt: iso(row.closedAt),
    escrowAddress: row.escrowAddress,
    usdcIssuer: row.usdcIssuer,
  };
}

async function progressByCampaignIds(ids) {
  if (!ids.length) return new Map();
  const rows = await getPrisma().donation.groupBy({
    by: ["campaignId"],
    where: {
      campaignId: { in: ids },
      verifiedOnChain: true,
      source: "ON_CHAIN",
      OR: [{ status: null }, { status: { notIn: ["FAILED", "REJECTED", "CANCELLED"] } }],
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return new Map(
    rows.map((row) => [
      row.campaignId,
      {
        raisedAmount: String(row._sum.amount || 0),
        donationCount: row._count._all,
      },
    ])
  );
}

async function uniqueSlug(title, excludeId) {
  const prisma = getPrisma();
  const base = slugifyCampaignTitle(title) || "campaign";
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await prisma.campaign.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base.slice(0, 63)}-${randomBytes(3).toString("hex")}`;
  }
  return `${base.slice(0, 59)}-${Date.now().toString(36)}`;
}

export const campaignsRepo = {
  async list({
    search,
    q,
    category,
    status,
    sort = "newest",
    page = 1,
    limit = 12,
    publicOnly = false,
    ownerId,
  } = {}) {
    const term = search || q;
    const where = {
      ...(ownerId ? { createdByUserId: ownerId } : {}),
      ...(publicOnly
        ? {
            visibility: "PUBLIC",
            status: ["ACTIVE", "COMPLETED"].includes(status)
              ? status
              : { in: ["ACTIVE", "COMPLETED"] },
          }
        : status
          ? { status }
          : {}),
      ...(category && category !== "All" ? { category } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { shortDescription: { contains: term, mode: "insensitive" } },
              { description: { contains: term, mode: "insensitive" } },
              { location: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const orderBy =
      sort === "oldest"
        ? { createdAt: "asc" }
        : sort === "ending_soon"
          ? { deadline: { sort: "asc", nulls: "last" } }
          : sort === "goal_low"
            ? { goal: "asc" }
            : sort === "goal_high"
              ? { goal: "desc" }
              : sort === "progress"
                ? { raised: "desc" }
                : { createdAt: "desc" };
    const prisma = getPrisma();
    const [total, rows] = await prisma.$transaction([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: campaignInclude,
      }),
    ]);
    const progress = await progressByCampaignIds(rows.map((row) => row.id));
    return {
      items: rows.map((row) => mapCampaign(row, progress.get(row.id))),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getById(idOrSlug) {
    const row = await getPrisma().campaign.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: campaignInclude,
    });
    if (!row) return null;
    const progress = await progressByCampaignIds([row.id]);
    return mapCampaign(row, progress.get(row.id));
  },

  async create(input) {
    const prisma = getPrisma();
    const slug = await uniqueSlug(input.title);
    const id = slug;
    const milestones = input.milestones || [];
    const row = await prisma.campaign.create({
      data: {
        id,
        slug,
        name: input.title,
        shortDescription: input.shortDescription || null,
        description: input.description || null,
        location: input.location || "",
        category: input.category,
        goal: input.goalAmount,
        currency: input.currency,
        deadline: input.deadline ? new Date(input.deadline) : null,
        visibility: input.visibility,
        coverImage: input.coverImage || null,
        status: "DRAFT",
        createdByUserId: input.ownerId,
        createdByWallet: input.ownerWallet,
        recipientId: input.recipientId,
        organizationId: input.organizationId,
        recipientName: input.recipientName || null,
        milestonesTotal: milestones.length,
        milestoneLabels: milestones.map((item) => ({
          index: item.sequence,
          label: item.title,
          amount: item.targetAmount,
        })),
        milestones: {
          create: milestones.map((item) => ({
            index: item.sequence,
            label: item.title,
            description: item.description || null,
            amount: item.targetAmount,
          })),
        },
      },
      include: campaignInclude,
    });
    return mapCampaign(row);
  },

  async update(id, data) {
    const prisma = getPrisma();
    const update = {
      ...(data.title !== undefined ? { name: data.title } : {}),
      ...(data.shortDescription !== undefined
        ? { shortDescription: data.shortDescription || null }
        : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.goalAmount !== undefined ? { goal: data.goalAmount } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.deadline !== undefined
        ? { deadline: data.deadline ? new Date(data.deadline) : null }
        : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...(data.coverImage !== undefined ? { coverImage: data.coverImage } : {}),
      ...(data.recipientId !== undefined ? { recipientId: data.recipientId } : {}),
      ...(data.organizationId !== undefined ? { organizationId: data.organizationId } : {}),
    };
    const current = await prisma.campaign.findUnique({ where: { id } });
    if (data.title && current?.status === "DRAFT") update.slug = await uniqueSlug(data.title, id);
    if (data.milestones) {
      await prisma.$transaction(async (tx) => {
        await tx.milestone.deleteMany({ where: { campaignId: id } });
        await tx.milestone.createMany({
          data: data.milestones.map((item) => ({
            campaignId: id,
            index: item.sequence,
            label: item.title,
            description: item.description || null,
            amount: item.targetAmount,
          })),
        });
        await tx.campaign.update({
          where: { id },
          data: {
            ...update,
            milestonesTotal: data.milestones.length,
            milestoneLabels: data.milestones.map((item) => ({
              index: item.sequence,
              label: item.title,
              amount: item.targetAmount,
            })),
          },
        });
      });
    } else {
      await prisma.campaign.update({ where: { id }, data: update });
    }
    return this.getById(id);
  },

  async transition(id, nextStatus, rejectionReason) {
    const timestamps = {
      SUBMITTED: "submittedAt",
      APPROVED: "approvedAt",
      ACTIVE: "activatedAt",
      COMPLETED: "completedAt",
      CLOSED: "closedAt",
    };
    await getPrisma().campaign.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(timestamps[nextStatus] ? { [timestamps[nextStatus]]: new Date() } : {}),
        rejectionReason: nextStatus === "REJECTED" ? rejectionReason : null,
      },
    });
    return this.getById(id);
  },

  async deleteDraft(id) {
    return getPrisma().campaign.delete({ where: { id } });
  },

  async setMilestonesVerified(id, count) {
    await getPrisma().campaign.update({
      where: { id },
      data: { milestonesVerified: count },
    });
    return this.getById(id);
  },

  async setEscrowBinding(id, { escrowAddress, usdcIssuer = null }) {
    await getPrisma().campaign.update({
      where: { id },
      data: {
        escrowAddress,
        ...(usdcIssuer !== undefined ? { usdcIssuer: usdcIssuer || null } : {}),
      },
    });
    return this.getById(id);
  },
};

export const milestonesRepo = {
  async create(campaignId, input) {
    const row = await getPrisma().milestone.create({
      data: {
        campaignId,
        index: input.sequence,
        label: input.title,
        description: input.description || null,
        amount: input.targetAmount,
      },
    });
    return mapMilestone(row);
  },
  async update(id, input) {
    const row = await getPrisma().milestone.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { label: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.targetAmount !== undefined ? { amount: input.targetAmount } : {}),
        ...(input.sequence !== undefined ? { index: input.sequence } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    return mapMilestone(row);
  },
  async findById(id) {
    const row = await getPrisma().milestone.findUnique({ where: { id } });
    return row ? mapMilestone(row) : null;
  },
  async markVerifiedByIndex(campaignId, milestoneIndex) {
    const row = await getPrisma().milestone.updateMany({
      where: { campaignId, index: Number(milestoneIndex) },
      data: { verified: true, status: "COMPLETED" },
    });
    return row.count;
  },
  async markReleasedByIndex(campaignId, milestoneIndex) {
    const row = await getPrisma().milestone.updateMany({
      where: { campaignId, index: Number(milestoneIndex) },
      data: { released: true, verified: true, status: "COMPLETED" },
    });
    return row.count;
  },
};

export const campaignUpdatesRepo = {
  async create(campaignId, authorId, input) {
    const row = await getPrisma().campaignUpdate.create({
      data: {
        campaignId,
        authorId,
        title: input.title,
        content: input.content,
        status: input.publish ? "PUBLISHED" : "DRAFT",
        publishedAt: input.publish ? new Date() : null,
      },
      include: {
        author: { select: { id: true, profile: { select: { displayName: true } } } },
      },
    });
    return mapUpdate(row);
  },
  async list(campaignId, { publishedOnly = true } = {}) {
    const rows = await getPrisma().campaignUpdate.findMany({
      where: { campaignId, ...(publishedOnly ? { status: "PUBLISHED" } : {}) },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      include: {
        author: { select: { id: true, profile: { select: { displayName: true } } } },
      },
    });
    return rows.map(mapUpdate);
  },
  async findById(id) {
    const row = await getPrisma().campaignUpdate.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, profile: { select: { displayName: true } } } },
      },
    });
    return row ? mapUpdate(row) : null;
  },
  async update(id, input) {
    const row = await getPrisma().campaignUpdate.update({
      where: { id },
      data: {
        title: input.title,
        content: input.content,
        ...(input.publish
          ? { status: "PUBLISHED", publishedAt: new Date() }
          : {}),
      },
      include: {
        author: { select: { id: true, profile: { select: { displayName: true } } } },
      },
    });
    return mapUpdate(row);
  },
};

export const campaignMediaRepo = {
  async create(campaignId, input) {
    const prisma = getPrisma();
    const row = await prisma.$transaction(async (tx) => {
      if (input.isCover) {
        await tx.campaignMedia.updateMany({
          where: { campaignId, isCover: true },
          data: { isCover: false },
        });
      }
      const created = await tx.campaignMedia.create({ data: { campaignId, ...input } });
      if (input.isCover) {
        await tx.campaign.update({ where: { id: campaignId }, data: { coverImage: input.url } });
      }
      return created;
    });
    return mapMedia(row);
  },
  async remove(id) {
    return getPrisma().campaignMedia.delete({ where: { id } });
  },
  async findById(id) {
    const row = await getPrisma().campaignMedia.findUnique({ where: { id } });
    return row ? mapMedia(row) : null;
  },
};
