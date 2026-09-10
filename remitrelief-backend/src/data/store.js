/**
 * JSON file store — Phase 3 offline/test fixture only.
 * Production persistence is Prisma → PostgreSQL (STORE_DRIVER=prisma + DATABASE_URL).
 * Do not use store.json as the durable production path.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// On Vercel the app filesystem is read-only; persist to /tmp (ephemeral) instead.
const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "remitrelief-data")
  : path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

const DEMO_ESCROW = process.env.DEMO_ESCROW_CONTRACT_ID || null;

const SEED = {
  campaigns: [
    {
      id: "flood-relief-oaxaca",
      name: "Oaxaca Flood Relief",
      location: "Oaxaca, Mexico",
      description:
        "Emergency shelter, clean water, and food kits for families displaced by flash flooding across the Sierra Madre del Sur.",
      category: "DISASTER",
      goal: 20000,
      raised: 6420,
      milestonesTotal: 4,
      milestonesVerified: 1,
      escrowAddress: DEMO_ESCROW,
      usdcIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      recipientName: "Cruz Roja Oaxaca",
      imageGradient: "linear-gradient(135deg, #0ea5e9 0%, #0369a1 55%, #0f172a 100%)",
      status: "ACTIVE",
      visibility: "PUBLIC",
      currency: "USDC",
      slug: "flood-relief-oaxaca",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
      milestoneLabels: [
        { index: 0, label: "Emergency kits staged", amount: 4000 },
        { index: 1, label: "Clean water for 200 households", amount: 5000 },
        { index: 2, label: "Temporary shelters erected", amount: 6000 },
        { index: 3, label: "Final food distribution", amount: 5000 },
      ],
    },
    {
      id: "wildfire-relief-california",
      name: "Northern California Wildfire Aid",
      location: "Shasta County, USA",
      description:
        "Rapid-response air filtration, evacuation support, and rebuilding grants for communities hit by seasonal wildfires.",
      category: "DISASTER",
      goal: 35000,
      raised: 12850,
      milestonesTotal: 3,
      milestonesVerified: 0,
      escrowAddress: null,
      usdcIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      recipientName: "Shasta Mutual Aid",
      imageGradient: "linear-gradient(135deg, #f97316 0%, #b91c1c 50%, #1c1917 100%)",
      status: "ACTIVE",
      visibility: "PUBLIC",
      currency: "USDC",
      slug: "wildfire-relief-california",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      milestoneLabels: [
        { index: 0, label: "Evacuation support deployed", amount: 10000 },
        { index: 1, label: "Air filters & PPE delivered", amount: 12000 },
        { index: 2, label: "Rebuilding microgrants issued", amount: 13000 },
      ],
    },
    {
      id: "cyclone-relief-mozambique",
      name: "Mozambique Cyclone Recovery",
      location: "Beira, Mozambique",
      description:
        "Roofing materials, medical supplies, and mobile clinics for coastal communities recovering from cyclone damage.",
      category: "DISASTER",
      goal: 50000,
      raised: 22100,
      milestonesTotal: 4,
      milestonesVerified: 2,
      escrowAddress: null,
      usdcIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      recipientName: "Beira Relief Collective",
      imageGradient: "linear-gradient(135deg, #14b8a6 0%, #0f766e 55%, #134e4a 100%)",
      status: "ACTIVE",
      visibility: "PUBLIC",
      currency: "USDC",
      slug: "cyclone-relief-mozambique",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
      milestoneLabels: [
        { index: 0, label: "Medical supplies landed", amount: 10000 },
        { index: 1, label: "Mobile clinic operational", amount: 12000 },
        { index: 2, label: "Roofing kits distributed", amount: 15000 },
        { index: 3, label: "School repairs completed", amount: 13000 },
      ],
    },
    {
      id: "earthquake-relief-turkey",
      name: "Southeast Turkey Quake Support",
      location: "Kahramanmaraş, Turkey",
      description:
        "Temporary housing modules, trauma care kits, and school restart grants for families recovering from seismic damage.",
      category: "DISASTER",
      goal: 80000,
      raised: 31400,
      milestonesTotal: 4,
      milestonesVerified: 1,
      escrowAddress: null,
      usdcIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      recipientName: "Anatolia Relief Network",
      imageGradient: "linear-gradient(135deg, #6366f1 0%, #312e81 55%, #0f172a 100%)",
      status: "ACTIVE",
      visibility: "PUBLIC",
      currency: "USDC",
      slug: "earthquake-relief-turkey",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
      milestoneLabels: [
        { index: 0, label: "Trauma kits distributed", amount: 15000 },
        { index: 1, label: "Housing modules installed", amount: 25000 },
        { index: 2, label: "Water systems restored", amount: 20000 },
        { index: 3, label: "Schools reopened", amount: 20000 },
      ],
    },
  ],
  donations: [
    {
      id: "don-seed-1",
      campaignId: "flood-relief-oaxaca",
      donor: "GDEMOSEED1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      amount: 250,
      txHash: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
      status: "demo-escrowed",
      message: "For the water kits",
      verifiedOnChain: false,
      source: "demo",
    },
    {
      id: "don-seed-2",
      campaignId: "cyclone-relief-mozambique",
      donor: "GDEMOSEED2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      amount: 100,
      txHash: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      status: "demo-escrowed",
      message: "",
      verifiedOnChain: false,
      source: "demo",
    },
    {
      id: "don-seed-3",
      campaignId: "earthquake-relief-turkey",
      donor: "GDEMOSEED3XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      amount: 500,
      txHash: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      status: "demo-escrowed",
      message: "Stay strong",
      verifiedOnChain: false,
      source: "demo",
    },
  ],
  ledger: [
    {
      id: "led-1",
      type: "donation",
      campaignId: "flood-relief-oaxaca",
      amount: 250,
      actor: "GDEMOSEED1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      txHash: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
      note: "Donation escrowed",
      verifiedOnChain: false,
      source: "demo",
    },
    {
      id: "led-2",
      type: "verify",
      campaignId: "flood-relief-oaxaca",
      milestoneIndex: 0,
      actor: "verifier",
      txHash: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      note: "Milestone 0 verified: Emergency kits staged",
      proofNote: "Photos uploaded by field team — 180 kits staged at warehouse B.",
      verifiedOnChain: false,
      source: "demo",
    },
    {
      id: "led-3",
      type: "release",
      campaignId: "flood-relief-oaxaca",
      amount: 4000,
      milestoneIndex: 0,
      actor: "system",
      txHash: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      note: "Milestone 0 released to Cruz Roja Oaxaca",
      verifiedOnChain: false,
      source: "demo",
    },
    {
      id: "led-4",
      type: "donation",
      campaignId: "cyclone-relief-mozambique",
      amount: 100,
      actor: "GDEMOSEED2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      txHash: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      note: "Donation escrowed",
      verifiedOnChain: false,
      source: "demo",
    },
    {
      id: "led-5",
      type: "donation",
      campaignId: "earthquake-relief-turkey",
      amount: 500,
      actor: "GDEMOSEED3XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      txHash: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      note: "Donation escrowed",
      verifiedOnChain: false,
      source: "demo",
    },
  ],
  users: [],
  organizations: [],
  organizationMembers: [],
  campaignUpdates: [],
  campaignMedia: [],
  auditLogs: [],
  authChallenges: [],
  sessions: [],
  indexedCursors: {},
};

const GRADIENTS = [
  "linear-gradient(135deg, #0ea5e9 0%, #0369a1 55%, #0f172a 100%)",
  "linear-gradient(135deg, #f97316 0%, #b91c1c 50%, #1c1917 100%)",
  "linear-gradient(135deg, #14b8a6 0%, #0f766e 55%, #134e4a 100%)",
  "linear-gradient(135deg, #6366f1 0%, #312e81 55%, #0f172a 100%)",
  "linear-gradient(135deg, #eab308 0%, #a16207 55%, #1c1917 100%)",
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    const seed = structuredClone(SEED);
    // Re-apply env escrow on fresh seed
    seed.campaigns[0].escrowAddress = DEMO_ESCROW;
    saveState(seed);
    return seed;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!parsed.users) parsed.users = [];
    if (!parsed.authChallenges) parsed.authChallenges = [];
    if (!parsed.sessions) parsed.sessions = [];
    if (!parsed.indexedCursors) parsed.indexedCursors = {};
    if (!parsed.organizations) parsed.organizations = [];
    if (!parsed.organizationMembers) parsed.organizationMembers = [];
    if (!parsed.campaignUpdates) parsed.campaignUpdates = [];
    if (!parsed.campaignMedia) parsed.campaignMedia = [];
    if (!parsed.auditLogs) parsed.auditLogs = [];
    if (DEMO_ESCROW) {
      const oaxaca = parsed.campaigns?.find((c) => c.id === "flood-relief-oaxaca");
      if (oaxaca) oaxaca.escrowAddress = DEMO_ESCROW;
    }
    return parsed;
  } catch {
    const seed = structuredClone(SEED);
    seed.campaigns[0].escrowAddress = DEMO_ESCROW;
    saveState(seed);
    return seed;
  }
}

function saveState(state = db) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn("Could not persist store:", err.message);
  }
}

const db = loadState();

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function normalizeCampaign(campaign) {
  const status = String(campaign.status || "DRAFT").toUpperCase();
  const categoryMap = {
    FLOOD: "DISASTER",
    WILDFIRE: "DISASTER",
    CYCLONE: "DISASTER",
    EARTHQUAKE: "DISASTER",
    RELIEF: "EMERGENCY",
  };
  const milestones = (campaign.milestones || campaign.milestoneLabels || []).map(
    (item, sequence) => ({
      id: item.id || `${campaign.id}-milestone-${sequence}`,
      campaignId: campaign.id,
      sequence: item.sequence ?? item.index ?? sequence,
      index: item.sequence ?? item.index ?? sequence,
      title: item.title || item.label,
      label: item.title || item.label,
      description: item.description || "",
      targetAmount: String(item.targetAmount ?? item.amount),
      amount: String(item.targetAmount ?? item.amount),
      status: item.status || (item.verified ? "COMPLETED" : "PENDING"),
      verified: Boolean(item.verified),
      released: Boolean(item.released),
    })
  );
  const donations = db.donations.filter(
    (item) =>
      item.campaignId === campaign.id &&
      item.verifiedOnChain &&
      item.source === "on_chain" &&
      !["FAILED", "REJECTED", "CANCELLED"].includes(String(item.status || "").toUpperCase())
  );
  const raisedAmount = donations
    .reduce((sum, item) => sum + Number(item.amount), 0)
    .toFixed(7)
    .replace(/\.?0+$/, "");
  const goalAmount = String(campaign.goalAmount ?? campaign.goal);
  return {
    ...campaign,
    slug: campaign.slug || campaign.id,
    title: campaign.title || campaign.name,
    name: campaign.title || campaign.name,
    shortDescription:
      campaign.shortDescription || String(campaign.description || "").slice(0, 180),
    category: categoryMap[String(campaign.category || "").toUpperCase()] ||
      String(campaign.category || "EMERGENCY").toUpperCase(),
    status,
    visibility: campaign.visibility || "PUBLIC",
    currency: campaign.currency || "USDC",
    goalAmount,
    goal: Number(goalAmount),
    raisedAmount,
    raised: Number(raisedAmount),
    donationCount: donations.length,
    progressPercentage: Number(goalAmount) > 0
      ? Math.min(100, Math.round((Number(raisedAmount) / Number(goalAmount)) * 1000) / 10)
      : 0,
    ownerId: campaign.ownerId || campaign.createdByUserId || campaign.createdBy,
    recipientId: campaign.recipientId || campaign.ownerId || campaign.createdBy,
    milestones,
    milestoneLabels: milestones.map((item) => ({
      index: item.sequence,
      label: item.title,
      amount: Number(item.targetAmount),
    })),
    milestonesTotal: milestones.length,
    milestonesVerified: milestones.filter((item) => item.status === "COMPLETED").length,
    updates: db.campaignUpdates
      .filter((item) => item.campaignId === campaign.id && item.status === "PUBLISHED")
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))),
    media: db.campaignMedia
      .filter((item) => item.campaignId === campaign.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    updatedAt: campaign.updatedAt || campaign.createdAt,
  };
}

export function listCampaigns({
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
  let rows = db.campaigns.map(normalizeCampaign);
  if (ownerId) rows = rows.filter((c) => c.ownerId === ownerId);
  if (publicOnly) {
    rows = rows.filter(
      (c) =>
        c.visibility === "PUBLIC" &&
        ["ACTIVE", "COMPLETED"].includes(c.status) &&
        (!["ACTIVE", "COMPLETED"].includes(status) || c.status === status)
    );
  } else if (status) rows = rows.filter((c) => c.status === status);
  if (category && category !== "All") rows = rows.filter((c) => c.category === category);
  const term = search || q;
  if (term) {
    const needle = term.toLowerCase();
    rows = rows.filter((c) =>
      [c.title, c.shortDescription, c.description, c.location].some((value) =>
        String(value || "").toLowerCase().includes(needle)
      )
    );
  }
  const sorters = {
    oldest: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
    ending_soon: (a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")),
    goal_low: (a, b) => a.goal - b.goal,
    goal_high: (a, b) => b.goal - a.goal,
    progress: (a, b) => b.progressPercentage - a.progressPercentage,
    newest: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
  };
  rows.sort(sorters[sort] || sorters.newest);
  const total = rows.length;
  return {
    items: rows.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function getCampaign(id) {
  const campaign = db.campaigns.find((c) => c.id === id || c.slug === id);
  return campaign ? normalizeCampaign(campaign) : null;
}

export function createCampaign(input) {
  let id = slugify(input.title) || uid("campaign");
  if (db.campaigns.some((c) => c.id === id || c.slug === id)) {
    id = `${id}-${Date.now().toString(36)}`;
  }
  const now = new Date().toISOString();
  const campaign = {
    id,
    slug: id,
    name: input.title,
    shortDescription: input.shortDescription || "",
    location: input.location || "",
    description: input.description || "",
    category: input.category,
    goal: input.goalAmount,
    raised: 0,
    currency: input.currency,
    deadline: input.deadline || null,
    visibility: input.visibility,
    coverImage: input.coverImage || null,
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
    createdBy: input.ownerWallet,
    ownerId: input.ownerId,
    recipientId: input.recipientId,
    organizationId: input.organizationId,
    milestones: (input.milestones || []).map((item) => ({
      ...item,
      id: uid("milestone"),
      index: item.sequence,
      label: item.title,
      amount: item.targetAmount,
      status: "PENDING",
    })),
    imageGradient: GRADIENTS[db.campaigns.length % GRADIENTS.length],
  };
  db.campaigns.unshift(campaign);
  saveState();
  return normalizeCampaign(campaign);
}

export function updateCampaign(id, input) {
  const campaign = db.campaigns.find((item) => item.id === id);
  if (!campaign) return null;
  Object.assign(campaign, {
    ...(input.title !== undefined ? { name: input.title } : {}),
    ...(input.goalAmount !== undefined ? { goal: input.goalAmount } : {}),
    ...input,
    updatedAt: new Date().toISOString(),
  });
  if (input.title && campaign.status === "DRAFT") campaign.slug = slugify(input.title);
  if (input.milestones) {
    campaign.milestones = input.milestones.map((item) => ({
      ...item,
      id: item.id || uid("milestone"),
      index: item.sequence,
      label: item.title,
      amount: item.targetAmount,
      status: item.status || "PENDING",
    }));
  }
  saveState();
  return normalizeCampaign(campaign);
}

export function transitionCampaign(id, status, rejectionReason) {
  const campaign = db.campaigns.find((item) => item.id === id);
  if (!campaign) return null;
  campaign.status = status;
  campaign.rejectionReason = status === "REJECTED" ? rejectionReason : null;
  const timestampFields = {
    SUBMITTED: "submittedAt",
    APPROVED: "approvedAt",
    ACTIVE: "activatedAt",
    COMPLETED: "completedAt",
    CLOSED: "closedAt",
  };
  if (timestampFields[status]) campaign[timestampFields[status]] = new Date().toISOString();
  campaign.updatedAt = new Date().toISOString();
  saveState();
  return normalizeCampaign(campaign);
}

export function deleteDraftCampaign(id) {
  const index = db.campaigns.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const [removed] = db.campaigns.splice(index, 1);
  db.campaignUpdates = db.campaignUpdates.filter((item) => item.campaignId !== id);
  db.campaignMedia = db.campaignMedia.filter((item) => item.campaignId !== id);
  saveState();
  return removed;
}

export function createMilestone(campaignId, input) {
  const campaign = db.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return null;
  campaign.milestones ||= [];
  const milestone = {
    id: uid("milestone"),
    campaignId,
    index: input.sequence,
    sequence: input.sequence,
    label: input.title,
    title: input.title,
    description: input.description || "",
    amount: input.targetAmount,
    targetAmount: input.targetAmount,
    status: "PENDING",
  };
  campaign.milestones.push(milestone);
  campaign.updatedAt = new Date().toISOString();
  saveState();
  return milestone;
}

export function getMilestone(id) {
  for (const campaign of db.campaigns) {
    const milestone = campaign.milestones?.find((item) => item.id === id);
    if (milestone) return { ...milestone, campaignId: campaign.id };
  }
  return null;
}

export function updateMilestone(id, input) {
  for (const campaign of db.campaigns) {
    const milestone = campaign.milestones?.find((item) => item.id === id);
    if (!milestone) continue;
    Object.assign(milestone, {
      ...(input.title !== undefined ? { title: input.title, label: input.title } : {}),
      ...(input.targetAmount !== undefined
        ? { targetAmount: input.targetAmount, amount: input.targetAmount }
        : {}),
      ...input,
      ...(input.sequence !== undefined ? { index: input.sequence } : {}),
    });
    saveState();
    return { ...milestone, campaignId: campaign.id };
  }
  return null;
}

export function createCampaignUpdate(campaignId, authorId, input) {
  const now = new Date().toISOString();
  const update = {
    id: uid("update"),
    campaignId,
    authorId,
    title: input.title,
    content: input.content,
    status: input.publish ? "PUBLISHED" : "DRAFT",
    createdAt: now,
    updatedAt: now,
    publishedAt: input.publish ? now : null,
  };
  db.campaignUpdates.push(update);
  saveState();
  return { ...update };
}

export function listCampaignUpdates(campaignId, { publishedOnly = true } = {}) {
  return db.campaignUpdates
    .filter(
      (item) => item.campaignId === campaignId && (!publishedOnly || item.status === "PUBLISHED")
    )
    .map((item) => ({ ...item }));
}

export function getCampaignUpdate(id) {
  const update = db.campaignUpdates.find((item) => item.id === id);
  return update ? { ...update } : null;
}

export function updateCampaignUpdate(id, input) {
  const update = db.campaignUpdates.find((item) => item.id === id);
  if (!update) return null;
  update.title = input.title;
  update.content = input.content;
  update.updatedAt = new Date().toISOString();
  if (input.publish) {
    update.status = "PUBLISHED";
    update.publishedAt ||= update.updatedAt;
  }
  saveState();
  return { ...update };
}

export function createCampaignMedia(campaignId, input) {
  if (input.isCover) {
    for (const item of db.campaignMedia) {
      if (item.campaignId === campaignId) item.isCover = false;
    }
  }
  const media = {
    id: uid("media"),
    campaignId,
    ...input,
    createdAt: new Date().toISOString(),
  };
  db.campaignMedia.push(media);
  const campaign = db.campaigns.find((item) => item.id === campaignId);
  if (campaign && input.isCover) campaign.coverImage = input.url;
  saveState();
  return { ...media };
}

export function getCampaignMedia(id) {
  const media = db.campaignMedia.find((item) => item.id === id);
  return media ? { ...media } : null;
}

export function removeCampaignMedia(id) {
  const index = db.campaignMedia.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const [removed] = db.campaignMedia.splice(index, 1);
  saveState();
  return removed;
}

export function bumpRaised(campaignId, amount) {
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return null;
  campaign.raised = Number(campaign.raised) + Number(amount);
  saveState();
  return { ...campaign };
}

export function setMilestonesVerified(campaignId, count) {
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return null;
  campaign.milestonesVerified = count;
  saveState();
  return { ...campaign };
}

export function findDonationByTxHash(txHash) {
  if (!txHash) return null;
  return db.donations.find((d) => d.txHash === txHash) || null;
}

export function recordDonation({
  campaignId,
  donor,
  amount,
  txHash = null,
  status = "escrowed",
  message = "",
  verifiedOnChain = false,
  source = "application",
}) {
  const entry = {
    id: uid("don"),
    campaignId,
    donor,
    amount: Number(amount),
    txHash,
    createdAt: new Date().toISOString(),
    status,
    message: String(message || "").slice(0, 200),
    verifiedOnChain: Boolean(verifiedOnChain),
    source,
  };
  db.donations.unshift(entry);
  if (verifiedOnChain && source === "on_chain") bumpRaised(campaignId, amount);
  appendLedger({
    type: "donation",
    campaignId,
    amount: Number(amount),
    actor: donor,
    txHash,
    note: message ? `Donation escrowed — “${entry.message}”` : "Donation escrowed",
    verifiedOnChain: Boolean(verifiedOnChain),
    source: verifiedOnChain ? "on_chain" : source || "demo",
  });
  return entry;
}

export function listDonations({ donor, campaignId } = {}) {
  return db.donations.filter((d) => {
    if (donor && d.donor !== donor) return false;
    if (campaignId && d.campaignId !== campaignId) return false;
    return true;
  });
}

export function findLedgerEvent({ txHash, type, campaignId } = {}) {
  if (!txHash || !type) return null;
  return (
    db.ledger.find(
      (e) =>
        e.txHash === txHash &&
        e.type === type &&
        (campaignId == null || e.campaignId === campaignId)
    ) || null
  );
}

export function appendLedger(event) {
  if (event.txHash && event.type) {
    const existing = findLedgerEvent({
      txHash: event.txHash,
      type: event.type,
      campaignId: event.campaignId,
    });
    if (existing) return { ...existing, _duplicate: true };
  }

  const verifiedOnChain = Boolean(event.verifiedOnChain);
  const entry = {
    id: uid("led"),
    createdAt: new Date().toISOString(),
    txHash: event.txHash ?? null,
    type: event.type,
    campaignId: event.campaignId,
    amount: event.amount,
    milestoneIndex: event.milestoneIndex,
    actor: event.actor,
    note: event.note,
    proofNote: event.proofNote,
    verifiedOnChain,
    source: verifiedOnChain ? "on_chain" : event.source || "demo",
  };
  db.ledger.unshift(entry);
  saveState();
  return entry;
}

function parseKeys(...envNames) {
  const set = new Set();
  for (const name of envNames) {
    const raw = process.env[name] || "";
    for (const part of raw.split(",")) {
      const t = part.trim();
      if (t) set.add(t);
    }
  }
  return set;
}

function seedRolesFor(publicKey) {
  const { Roles, normalizeRoles } = requireRoles();
  const roles = new Set([Roles.DONOR]);
  const admins = parseKeys("ADMIN_PUBLIC_KEYS", "OPERATOR_PUBLIC_KEYS");
  const ngos = parseKeys("NGO_PUBLIC_KEYS", "VERIFIER_PUBLIC_KEYS");
  const recipients = parseKeys("RECIPIENT_PUBLIC_KEYS");
  if (admins.has(publicKey)) roles.add(Roles.ADMIN);
  if (ngos.has(publicKey)) roles.add(Roles.NGO);
  if (recipients.has(publicKey)) roles.add(Roles.RECIPIENT);
  return normalizeRoles([...roles]);
}

function requireRoles() {
  // Local import avoids circular init with config; roles module is pure.
  return {
    Roles: {
      DONOR: "DONOR",
      RECIPIENT: "RECIPIENT",
      NGO: "NGO",
      ADMIN: "ADMIN",
      UNASSIGNED: "UNASSIGNED",
    },
    normalizeRoles(roles = []) {
      const map = {
        donor: "DONOR",
        organizer: "NGO",
        verifier: "NGO",
        operator: "ADMIN",
        DONOR: "DONOR",
        RECIPIENT: "RECIPIENT",
        NGO: "NGO",
        ADMIN: "ADMIN",
        UNASSIGNED: "UNASSIGNED",
      };
      const set = new Set(
        roles.map((r) => map[r] || map[String(r).toLowerCase()] || map[String(r).toUpperCase()] || "DONOR")
      );
      set.delete("UNASSIGNED");
      if (!set.size) set.add("DONOR");
      return [...set];
    },
  };
}

export function getUser(publicKey) {
  if (!db.users) db.users = [];
  const user = db.users.find(
    (u) => u.publicKey === publicKey || u.walletAddress === publicKey || u.id === publicKey
  );
  if (!user) return null;
  const { normalizeRoles } = requireRoles();
  const status = (user.status || "ACTIVE").toUpperCase();
  return {
    id: user.id || user.publicKey,
    publicKey: user.publicKey || user.walletAddress,
    walletAddress: user.publicKey || user.walletAddress,
    roles: normalizeRoles(user.roles || []),
    role: user.role || normalizeRoles(user.roles || [])[0],
    status: status === "ACTIVE" || status === "SUSPENDED" || status === "PENDING" || status === "DEACTIVATED"
      ? status
      : "ACTIVE",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || user.lastLoginAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function upsertUser(publicKey, { addRoles = [], status } = {}) {
  if (!db.users) db.users = [];
  const { normalizeRoles } = requireRoles();
  let user = db.users.find((u) => u.publicKey === publicKey || u.id === publicKey);
  if (!user) {
    user = {
      id: publicKey,
      publicKey,
      walletAddress: publicKey,
      roles: seedRolesFor(publicKey),
      status: status || "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    db.users.push(user);
  } else {
    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = user.lastLoginAt;
    user.roles = normalizeRoles([...(user.roles || []), ...seedRolesFor(publicKey)]);
    if (status) user.status = status;
  }
  if (addRoles.length) {
    user.roles = normalizeRoles([...(user.roles || []), ...addRoles]);
  }
  user.role = user.roles.includes("ADMIN")
    ? "ADMIN"
    : user.roles.includes("NGO")
      ? "NGO"
      : user.roles.includes("RECIPIENT")
        ? "RECIPIENT"
        : "DONOR";
  saveState();
  return getUser(publicKey);
}

export function addUserRole(publicKey, role) {
  return upsertUser(publicKey, { addRoles: [role] });
}

export function createOrganization(input) {
  const organization = {
    id: uid("org"),
    name: input.name,
    slug: input.slug || slugify(input.name),
    description: input.description || null,
    walletAddress: input.walletAddress || null,
    status: input.status || "PENDING",
    createdAt: new Date().toISOString(),
  };
  db.organizations.push(organization);
  saveState();
  return { ...organization };
}

export function getOrganization(id) {
  const organization = db.organizations.find((item) => item.id === id || item.slug === id);
  if (!organization) return null;
  return {
    ...organization,
    members: db.organizationMembers.filter((item) => item.organizationId === organization.id),
  };
}

export function addOrganizationMember(input) {
  if (
    db.organizationMembers.some(
      (item) =>
        item.organizationId === input.organizationId && item.userId === input.userId
    )
  ) {
    const error = new Error("organization membership already exists");
    error.code = "DUPLICATE_RESOURCE";
    throw error;
  }
  const member = {
    id: uid("member"),
    organizationId: input.organizationId,
    userId: input.userId,
    role: input.role || "MEMBER",
    status: input.status || "ACTIVE",
    createdAt: new Date().toISOString(),
  };
  db.organizationMembers.push(member);
  saveState();
  return { ...member };
}

export function listOrganizationMembers(organizationId) {
  return db.organizationMembers
    .filter((item) => item.organizationId === organizationId)
    .map((item) => ({ ...item }));
}

export function listOrganizationsForUser(userId) {
  return db.organizationMembers
    .filter((item) => item.userId === userId && item.status === "ACTIVE")
    .map((membership) => {
      const organization = db.organizations.find(
        (item) => item.id === membership.organizationId
      );
      return organization
        ? { ...organization, membershipRole: membership.role }
        : null;
    })
    .filter(Boolean);
}

export function createAuditLog(input) {
  const row = { id: uid("audit"), ...input, createdAt: new Date().toISOString() };
  db.auditLogs.push(row);
  saveState();
  return { ...row };
}

export function listAuditLogsByUser(userId) {
  return db.auditLogs.filter((item) => item.userId === userId).map((item) => ({ ...item }));
}

export function saveAuthChallenge(row) {
  if (!db.authChallenges) db.authChallenges = [];
  db.authChallenges = db.authChallenges.filter(
    (c) => c.publicKey !== row.publicKey && new Date(c.expiresAt).getTime() > Date.now()
  );
  const entry = {
    ...row,
    used: false,
    createdAt: new Date().toISOString(),
  };
  db.authChallenges.push(entry);
  saveState();
  return { ...entry };
}

export function getAuthChallenge(publicKey, nonce) {
  if (!db.authChallenges) db.authChallenges = [];
  return db.authChallenges.find((c) => c.publicKey === publicKey && c.nonce === nonce) || null;
}

export function consumeAuthChallenge(publicKey, nonce) {
  if (!db.authChallenges) db.authChallenges = [];
  const idx = db.authChallenges.findIndex((c) => c.publicKey === publicKey && c.nonce === nonce);
  if (idx < 0) return null;
  const row = db.authChallenges[idx];
  if (row.used) return { ...row, _alreadyUsed: true };
  row.used = true;
  db.authChallenges.splice(idx, 1);
  saveState();
  return { ...row };
}

export function createSession({
  id,
  userId,
  walletAddress,
  roles,
  expiresAt,
}) {
  if (!db.sessions) db.sessions = [];
  const session = {
    id,
    userId,
    walletAddress,
    roles: [...(roles || [])],
    createdAt: new Date().toISOString(),
    expiresAt,
    revokedAt: null,
    lastUsedAt: new Date().toISOString(),
  };
  db.sessions.push(session);
  saveState();
  return { ...session };
}

export function findSession(id) {
  if (!db.sessions || !id) return null;
  const session = db.sessions.find((s) => s.id === id);
  return session ? { ...session, roles: [...(session.roles || [])] } : null;
}

export function touchSession(id) {
  if (!db.sessions) return null;
  const session = db.sessions.find((s) => s.id === id);
  if (!session) return null;
  session.lastUsedAt = new Date().toISOString();
  saveState();
  return { ...session };
}

export function revokeSession(id) {
  if (!db.sessions) return null;
  const session = db.sessions.find((s) => s.id === id);
  if (!session) return null;
  session.revokedAt = new Date().toISOString();
  saveState();
  return { ...session };
}

export function revokeAllSessionsForUser(userId) {
  if (!db.sessions) return 0;
  let n = 0;
  const now = new Date().toISOString();
  for (const s of db.sessions) {
    if ((s.userId === userId || s.walletAddress === userId) && !s.revokedAt) {
      s.revokedAt = now;
      n += 1;
    }
  }
  saveState();
  return n;
}

export function getIndexerCursor(key) {
  if (!db.indexedCursors) db.indexedCursors = {};
  return db.indexedCursors[key] || null;
}

export function setIndexerCursor(key, value) {
  if (!db.indexedCursors) db.indexedCursors = {};
  db.indexedCursors[key] = value;
  saveState();
  return value;
}

export function listLedger({ campaignId, type, limit = 50 } = {}) {
  let rows = campaignId ? db.ledger.filter((e) => e.campaignId === campaignId) : [...db.ledger];
  if (type) rows = rows.filter((e) => e.type === type);
  return rows.slice(0, limit);
}

export function getStats() {
  const campaigns = db.campaigns.map(normalizeCampaign);
  const donations = db.donations.filter(
    (item) =>
      item.verifiedOnChain &&
      item.source === "on_chain" &&
      !["FAILED", "REJECTED", "CANCELLED"].includes(String(item.status || "").toUpperCase())
  );
  const released = db.ledger
    .filter((e) => e.type === "release")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return {
    campaignsActive: campaigns.filter((c) => c.status === "ACTIVE").length,
    totalRaised: donations.reduce((sum, donation) => sum + Number(donation.amount), 0),
    totalGoal: campaigns.reduce((sum, c) => sum + Number(c.goal), 0),
    milestonesVerified: campaigns.reduce((sum, c) => sum + Number(c.milestonesVerified || 0), 0),
    milestonesTotal: campaigns.reduce((sum, c) => sum + Number(c.milestonesTotal || 0), 0),
    donationsCount: donations.length,
    amountReleased: released,
    categories: [...new Set(campaigns.map((c) => c.category).filter(Boolean))],
  };
}

export function resetStore() {
  const next = structuredClone(SEED);
  next.users = [];
  next.authChallenges = [];
  next.sessions = [];
  next.indexedCursors = {};
  Object.assign(db, next);
  db.campaigns[0].escrowAddress = DEMO_ESCROW;
  saveState();
  return getStats();
}

/** Exposed for postgres seed parity */
export function getSeedSnapshot() {
  const seed = structuredClone(SEED);
  seed.campaigns[0].escrowAddress = DEMO_ESCROW;
  return seed;
}
