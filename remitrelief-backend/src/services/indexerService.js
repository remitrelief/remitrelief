import { logger } from "../lib/logger.js";
import {
  campaignsRepo,
  ledgerRepo,
  indexerRepo,
  milestonesRepo,
} from "../repositories/index.js";
import { fetchEscrowEventsPages } from "../blockchain/soroban/events.js";
import { getSorobanServer } from "../blockchain/soroban/client.js";

const LAST_RUN_KEY = "indexer:lastRun";
const DEFAULT_LOOKBACK = 10_000;

function parseMilestoneIndex(ev) {
  if (ev.milestoneIndex != null && Number.isFinite(Number(ev.milestoneIndex))) {
    return Number(ev.milestoneIndex);
  }
  for (const topic of ev.topics || []) {
    const asNum = Number(topic);
    if (Number.isInteger(asNum) && asNum >= 0 && asNum < 100) return asNum;
  }
  return null;
}

async function listEscrowCampaigns({ campaignId } = {}) {
  if (campaignId) {
    const campaign = await campaignsRepo.getById(campaignId);
    if (!campaign?.escrowAddress) return [];
    return [campaign];
  }

  const campaigns = [];
  let page = 1;
  let totalPages = 1;
  do {
    const listed = await campaignsRepo.list({ limit: 100, page });
    const rows = Array.isArray(listed) ? listed : listed.items || [];
    totalPages = Array.isArray(listed) ? 1 : listed.totalPages || 1;
    for (const row of rows) {
      if (row.escrowAddress) campaigns.push(row);
    }
    page += 1;
  } while (page <= totalPages);
  return campaigns;
}

/**
 * Poll Soroban events for campaigns with escrow addresses and append ledger rows.
 * Also lightly syncs relational milestone verified/released flags when index is known.
 * Idempotent on (txHash, type, campaignId).
 *
 * @param {{ limitPerContract?: number, maxPages?: number, campaignId?: string, backfill?: boolean, lookbackLedgers?: number }} options
 */
export async function runIndexer({
  limitPerContract = 50,
  maxPages = 20,
  campaignId,
  backfill = false,
  lookbackLedgers = DEFAULT_LOOKBACK,
} = {}) {
  const campaigns = await listEscrowCampaigns({ campaignId });
  const startedAt = new Date().toISOString();

  const summary = {
    campaigns: campaigns.length,
    scanned: 0,
    appended: 0,
    duplicates: 0,
    synced: 0,
    pages: 0,
    backfill: Boolean(backfill),
    campaignId: campaignId || null,
    errors: [],
    startedAt,
    finishedAt: null,
  };

  let latestNetworkLedger = null;
  try {
    const server = getSorobanServer();
    if (typeof server.getLatestLedger === "function") {
      const latest = await server.getLatestLedger();
      latestNetworkLedger = latest?.sequence ?? latest?.ledger ?? null;
    }
  } catch (err) {
    logger.debug("Could not read latest ledger", { reason: err.message });
  }

  for (const campaign of campaigns) {
    const cursorKey = `escrow:${campaign.escrowAddress}`;
    try {
      if (backfill && indexerRepo.clearCursor) {
        await indexerRepo.clearCursor(cursorKey);
      }

      const storedCursor = backfill ? null : await indexerRepo.getCursor(cursorKey);
      const startLedger =
        !storedCursor && latestNetworkLedger
          ? Math.max(1, Number(latestNetworkLedger) - Number(lookbackLedgers || DEFAULT_LOOKBACK))
          : undefined;

      const { events, cursor, pages } = await fetchEscrowEventsPages({
        contractId: campaign.escrowAddress,
        cursor: storedCursor || undefined,
        startLedger,
        limit: limitPerContract,
        maxPages,
      });

      summary.pages += pages || 0;
      summary.scanned += events.length;

      for (const ev of events) {
        if (!ev.txHash || ev.type === "init") continue;

        const milestoneIndex = parseMilestoneIndex(ev);
        const amount = ev.amount != null && Number.isFinite(Number(ev.amount)) ? Number(ev.amount) : undefined;
        const note =
          ev.type === "donation"
            ? "Donation escrowed (indexed from chain)"
            : ev.type === "verify"
              ? `Milestone${milestoneIndex != null ? ` ${milestoneIndex}` : ""} verified (indexed from chain)`
              : `Milestone${milestoneIndex != null ? ` ${milestoneIndex}` : ""} released (indexed from chain)`;

        const entry = await ledgerRepo.append({
          type: ev.type,
          campaignId: campaign.id,
          actor: "indexer",
          txHash: ev.txHash,
          milestoneIndex: milestoneIndex ?? undefined,
          amount,
          note,
          verifiedOnChain: true,
          source: "on_chain",
        });

        if (entry._duplicate) {
          summary.duplicates += 1;
        } else {
          summary.appended += 1;
        }

        if (milestoneIndex != null && !entry._duplicate) {
          if (ev.type === "verify") {
            await milestonesRepo.markVerifiedByIndex(campaign.id, milestoneIndex);
            const next = Math.min(
              Number(campaign.milestonesTotal || 99),
              Math.max(Number(campaign.milestonesVerified || 0), milestoneIndex + 1)
            );
            await campaignsRepo.setMilestonesVerified(campaign.id, next);
            campaign.milestonesVerified = next;
            summary.synced += 1;
          } else if (ev.type === "release") {
            await milestonesRepo.markReleasedByIndex(campaign.id, milestoneIndex);
            summary.synced += 1;
          }
        }
      }

      if (cursor) {
        await indexerRepo.setCursor(cursorKey, String(cursor));
      } else if (!storedCursor && latestNetworkLedger) {
        await indexerRepo.setCursor(cursorKey, String(latestNetworkLedger));
      }
    } catch (err) {
      summary.errors.push({ campaignId: campaign.id, reason: err.message });
      logger.warn("Indexer campaign failed", {
        campaignId: campaign.id,
        reason: err.message,
      });
    }
  }

  summary.finishedAt = new Date().toISOString();
  try {
    await indexerRepo.setCursor(LAST_RUN_KEY, JSON.stringify(summary));
  } catch (err) {
    logger.debug("Could not persist indexer last run", { reason: err.message });
  }

  return summary;
}

export async function indexerStatus() {
  const campaigns = await listEscrowCampaigns();
  const cursors = [];
  for (const c of campaigns) {
    const key = `escrow:${c.escrowAddress}`;
    cursors.push({
      campaignId: c.id,
      escrowAddress: c.escrowAddress,
      cursor: await indexerRepo.getCursor(key),
    });
  }

  let lastRun = null;
  try {
    const raw = await indexerRepo.getCursor(LAST_RUN_KEY);
    if (raw) lastRun = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    lastRun = null;
  }

  return {
    escrowCampaigns: campaigns.length,
    cursors,
    lastRun,
  };
}
