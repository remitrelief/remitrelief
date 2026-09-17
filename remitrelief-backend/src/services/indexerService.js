import { logger } from "../lib/logger.js";
import {
  campaignsRepo,
  ledgerRepo,
  indexerRepo,
  milestonesRepo,
} from "../repositories/index.js";
import { fetchEscrowEvents } from "../blockchain/soroban/events.js";
import { getSorobanServer } from "../blockchain/soroban/client.js";

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

/**
 * Poll Soroban events for campaigns with escrow addresses and append ledger rows.
 * Also lightly syncs relational milestone verified/released flags when index is known.
 * Idempotent on (txHash, type, campaignId).
 */
export async function runIndexer({ limitPerContract = 50 } = {}) {
  const listed = await campaignsRepo.list({ limit: 100, page: 1 });
  const rows = Array.isArray(listed) ? listed : listed.items || [];
  const campaigns = rows.filter((c) => c.escrowAddress);
  const summary = {
    campaigns: campaigns.length,
    scanned: 0,
    appended: 0,
    duplicates: 0,
    synced: 0,
    errors: [],
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
      const storedCursor = await indexerRepo.getCursor(cursorKey);
      const startLedger =
        !storedCursor && latestNetworkLedger
          ? Math.max(1, Number(latestNetworkLedger) - 10_000)
          : undefined;

      const { events, cursor } = await fetchEscrowEvents({
        contractId: campaign.escrowAddress,
        cursor: storedCursor || undefined,
        startLedger,
        limit: limitPerContract,
      });

      summary.scanned += events.length;

      for (const ev of events) {
        if (!ev.txHash || ev.type === "init") continue;

        const milestoneIndex = parseMilestoneIndex(ev);
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

  return summary;
}

export async function indexerStatus() {
  const listed = await campaignsRepo.list({ limit: 100, page: 1 });
  const rows = Array.isArray(listed) ? listed : listed.items || [];
  const campaigns = rows.filter((c) => c.escrowAddress);
  const cursors = [];
  for (const c of campaigns) {
    const key = `escrow:${c.escrowAddress}`;
    cursors.push({
      campaignId: c.id,
      escrowAddress: c.escrowAddress,
      cursor: await indexerRepo.getCursor(key),
    });
  }
  return { escrowCampaigns: campaigns.length, cursors };
}
