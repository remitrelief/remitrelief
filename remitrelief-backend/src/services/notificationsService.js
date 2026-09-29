import { AppError, ErrorCodes } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { donationsRepo, notificationsRepo, usersRepo } from "../repositories/index.js";

export const NotificationTypes = Object.freeze({
  VERIFICATION_REVIEWED: "VERIFICATION_REVIEWED",
  ACCOUNT_STATUS_CHANGED: "ACCOUNT_STATUS_CHANGED",
  CAMPAIGN_STATUS_CHANGED: "CAMPAIGN_STATUS_CHANGED",
  DONATION_RECEIVED: "DONATION_RECEIVED",
  PROOF_SUBMITTED: "PROOF_SUBMITTED",
  MILESTONE_VERIFIED: "MILESTONE_VERIFIED",
  MILESTONE_RELEASED: "MILESTONE_RELEASED",
});

const TITLE_MAX = 140;
const BODY_MAX = 500;
const LIST_MAX = 50;
const DONOR_FANOUT_MAX = 500;

function clip(value, max) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

export function campaignLink(campaign) {
  return `/campaigns/${campaign.slug || campaign.id}`;
}

export function manageCampaignLink(campaign) {
  return `/dashboard/campaigns/${campaign.id}`;
}

/**
 * Best-effort: a notification failure must never break the action that triggered it.
 */
export async function notifyUser(userId, { type, title, body, link }) {
  if (!userId || !type || !title) return null;
  try {
    return await notificationsRepo.create({
      userId,
      type,
      title: clip(title, TITLE_MAX),
      body: clip(body, BODY_MAX),
      link: clip(link, 300),
    });
  } catch (err) {
    logger.warn("notification create failed", { type, reason: err.message });
    return null;
  }
}

async function resolveUserIdByWallet(walletAddress) {
  if (!walletAddress) return null;
  try {
    const user = await usersRepo.getByPublicKey(walletAddress);
    return user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Notify each distinct user once. Accepts user ids and/or wallet addresses.
 */
export async function notifyMany({ userIds = [], wallets = [], exclude = [] }, payload) {
  const walletIds = await Promise.all(wallets.map(resolveUserIdByWallet));
  const skip = new Set(exclude.filter(Boolean));
  const targets = [...new Set([...userIds, ...walletIds].filter(Boolean))].filter(
    (id) => !skip.has(id)
  );
  const results = await Promise.allSettled(targets.map((id) => notifyUser(id, payload)));
  return results.filter((item) => item.status === "fulfilled" && item.value).length;
}

/**
 * Campaign owner + recipient, optionally every donor wallet on the campaign.
 */
export async function notifyCampaignStakeholders(
  campaign,
  payload,
  { includeDonors = false, exclude = [] } = {}
) {
  if (!campaign) return 0;
  let wallets = [];
  if (includeDonors) {
    try {
      const donations = await donationsRepo.list({ campaignId: campaign.id });
      wallets = [...new Set(donations.map((item) => item.donor).filter(Boolean))].slice(
        0,
        DONOR_FANOUT_MAX
      );
    } catch (err) {
      logger.warn("notification donor lookup failed", { reason: err.message });
    }
  }
  return notifyMany(
    { userIds: [campaign.ownerId, campaign.recipientId], wallets, exclude },
    payload
  );
}

function requireActor(actor) {
  if (!actor?.id) throw new AppError(ErrorCodes.AUTH_REQUIRED, "Authentication required");
}

export async function listMyNotifications(actor, { unreadOnly = false, limit = 20 } = {}) {
  requireActor(actor);
  const safeLimit = Math.min(LIST_MAX, Math.max(1, Number(limit) || 20));
  const [items, unreadCount] = await Promise.all([
    notificationsRepo.list({ userId: actor.id, unreadOnly: Boolean(unreadOnly), limit: safeLimit }),
    notificationsRepo.countUnread(actor.id),
  ]);
  return { items, unreadCount };
}

export async function getUnreadCount(actor) {
  requireActor(actor);
  return { unreadCount: await notificationsRepo.countUnread(actor.id) };
}

export async function markNotificationRead(id, actor) {
  requireActor(actor);
  const row = await notificationsRepo.markRead(id, actor.id);
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, "Notification not found");
  return row;
}

export async function markAllNotificationsRead(actor) {
  requireActor(actor);
  return { updated: await notificationsRepo.markAllRead(actor.id) };
}
