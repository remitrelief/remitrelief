import { AppError, ErrorCodes } from "../lib/errors.js";
import {
  campaignsRepo,
  donationsRepo,
  ledgerRepo,
  notificationsRepo,
} from "../repositories/index.js";

const CAMPAIGN_SCAN_LIMIT = 100;
const RECENT_LIMIT = 5;
const EXCLUDED_DONATION_STATUSES = new Set(["FAILED", "REJECTED", "CANCELLED"]);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round(value * 1e7) / 1e7;
}

function rowsOf(result) {
  return Array.isArray(result) ? result : result?.items || [];
}

function isCountedDonation(donation) {
  return !EXCLUDED_DONATION_STATUSES.has(String(donation.status || "").toUpperCase());
}

async function releasedTotal(campaignId) {
  const events = rowsOf(await ledgerRepo.list({ campaignId, type: "release", limit: 100 }));
  return roundMoney(events.reduce((sum, event) => sum + toNumber(event.amount), 0));
}

function campaignSummary(campaign, extra = {}) {
  const total = toNumber(campaign.milestonesTotal);
  const verified = toNumber(campaign.milestonesVerified);
  return {
    id: campaign.id,
    slug: campaign.slug || campaign.id,
    title: campaign.title || campaign.name,
    status: campaign.status,
    currency: campaign.currency || "USDC",
    goalAmount: toNumber(campaign.goalAmount ?? campaign.goal),
    raisedAmount: toNumber(campaign.raisedAmount ?? campaign.raised),
    progressPercentage: toNumber(campaign.progressPercentage),
    milestonesTotal: total,
    milestonesVerified: verified,
    nextMilestoneIndex: verified < total ? verified : null,
    ...extra,
  };
}

async function loadCampaigns(ids) {
  const rows = await Promise.all(ids.map((id) => campaignsRepo.getById(id).catch(() => null)));
  return rows.filter(Boolean);
}

async function donorSection(walletAddress) {
  const donations = (await donationsRepo.list({ donor: walletAddress })).filter(isCountedDonation);
  const onChain = donations.filter((item) => item.verifiedOnChain);
  const campaignIds = [...new Set(donations.map((item) => item.campaignId))].slice(
    0,
    CAMPAIGN_SCAN_LIMIT
  );
  const campaigns = await loadCampaigns(campaignIds);
  const supported = await Promise.all(
    campaigns.map(async (campaign) => {
      const mine = donations.filter((item) => item.campaignId === campaign.id);
      return campaignSummary(campaign, {
        givenAmount: roundMoney(mine.reduce((sum, item) => sum + toNumber(item.amount), 0)),
        releasedAmount: await releasedTotal(campaign.id),
      });
    })
  );
  const byDate = [...donations].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
  return {
    totalGiven: roundMoney(donations.reduce((sum, item) => sum + toNumber(item.amount), 0)),
    totalGivenOnChain: roundMoney(onChain.reduce((sum, item) => sum + toNumber(item.amount), 0)),
    donationCount: donations.length,
    campaignsSupported: campaignIds.length,
    campaignsWithReleases: supported.filter((item) => item.releasedAmount > 0).length,
    releasedOnSupported: roundMoney(supported.reduce((sum, item) => sum + item.releasedAmount, 0)),
    supportedCampaigns: supported,
    recentDonations: byDate.slice(0, RECENT_LIMIT).map((item) => ({
      id: item.id,
      campaignId: item.campaignId,
      campaignTitle:
        campaigns.find((campaign) => campaign.id === item.campaignId)?.title || item.campaignId,
      amount: toNumber(item.amount),
      verifiedOnChain: Boolean(item.verifiedOnChain),
      txHash: item.txHash || null,
      createdAt: item.createdAt,
    })),
  };
}

function organizerAction(campaign) {
  switch (campaign.status) {
    case "DRAFT":
      return "Finish and submit for review";
    case "REJECTED":
      return "Revise and resubmit";
    case "APPROVED":
      return "Waiting for admin activation";
    case "ACTIVE":
      return campaign.nextMilestoneIndex != null
        ? `Submit proof for milestone ${campaign.nextMilestoneIndex + 1}`
        : null;
    default:
      return null;
  }
}

async function organizerSection(userId) {
  const campaigns = rowsOf(
    await campaignsRepo.list({ ownerId: userId, limit: CAMPAIGN_SCAN_LIMIT, page: 1 })
  );
  const summaries = await Promise.all(
    campaigns.map(async (campaign) =>
      campaignSummary(campaign, { releasedAmount: await releasedTotal(campaign.id) })
    )
  );
  const withActions = summaries.map((item) => ({ ...item, nextAction: organizerAction(item) }));
  const byStatus = withActions.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    campaignCount: withActions.length,
    byStatus,
    totalRaised: roundMoney(withActions.reduce((sum, item) => sum + item.raisedAmount, 0)),
    totalReleased: roundMoney(withActions.reduce((sum, item) => sum + item.releasedAmount, 0)),
    milestonesVerified: withActions.reduce((sum, item) => sum + item.milestonesVerified, 0),
    milestonesTotal: withActions.reduce((sum, item) => sum + item.milestonesTotal, 0),
    needsAttention: withActions.filter((item) => item.nextAction),
    campaigns: withActions,
  };
}

async function recipientSection(userId) {
  const campaigns = rowsOf(
    await campaignsRepo.list({ recipientId: userId, limit: CAMPAIGN_SCAN_LIMIT, page: 1 })
  ).filter((campaign) => campaign.ownerId !== userId);
  const summaries = await Promise.all(
    campaigns.map(async (campaign) =>
      campaignSummary(campaign, { releasedAmount: await releasedTotal(campaign.id) })
    )
  );
  return {
    campaignCount: summaries.length,
    totalReleased: roundMoney(summaries.reduce((sum, item) => sum + item.releasedAmount, 0)),
    campaigns: summaries,
  };
}

/**
 * One call for the signed-in user's dashboard. Sections appear only when they have data
 * (or when the role implies them), so the UI can render donor/NGO/recipient views.
 */
export async function getMyDashboard(actor) {
  if (!actor?.id) throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required");
  const wallet = actor.walletAddress || actor.publicKey;
  const roles = actor.roles || [];

  const [donor, organizer, recipient, unreadCount] = await Promise.all([
    wallet ? donorSection(wallet) : null,
    organizerSection(actor.id),
    recipientSection(actor.id),
    notificationsRepo.countUnread(actor.id),
  ]);

  return {
    roles,
    verificationStatus: actor.verificationStatus || "UNVERIFIED",
    unreadNotifications: unreadCount,
    donor,
    organizer:
      organizer.campaignCount > 0 || roles.includes("NGO") || roles.includes("ADMIN")
        ? organizer
        : null,
    recipient: recipient.campaignCount > 0 || roles.includes("RECIPIENT") ? recipient : null,
  };
}
