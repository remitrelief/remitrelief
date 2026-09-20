import { AppError, ErrorCodes } from "../lib/errors.js";
import { auditRepo } from "../repositories/index.js";
import { indexerStatus, runIndexer } from "./indexerService.js";

function isAdmin(actor) {
  return Boolean(actor?.roles?.includes("ADMIN"));
}

export async function listRecentAudits(actor, { limit = 50 } = {}) {
  if (!isAdmin(actor)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required");
  }
  return auditRepo.findRecent({ limit: Math.min(100, Number(limit) || 50) });
}

export async function getAdminIndexerStatus(actor) {
  if (!isAdmin(actor)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required");
  }
  return indexerStatus();
}

export async function runAdminIndexer(actor, options = {}) {
  if (!isAdmin(actor)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required");
  }
  const summary = await runIndexer({
    limitPerContract: Number(options.limitPerContract) || 50,
    maxPages: Number(options.maxPages) || 20,
    campaignId: options.campaignId || undefined,
    backfill: Boolean(options.backfill),
    lookbackLedgers: Number(options.lookbackLedgers) || undefined,
  });
  await auditRepo.create({
    userId: actor.id,
    action: "INDEXER_RUN",
    resourceType: "Indexer",
    resourceId: options.campaignId || "all",
    metadata: {
      appended: summary.appended,
      scanned: summary.scanned,
      duplicates: summary.duplicates,
      errors: summary.errors?.length || 0,
      backfill: summary.backfill,
    },
  });
  return summary;
}
