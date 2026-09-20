import { AppError, ErrorCodes } from "../lib/errors.js";
import { auditRepo } from "../repositories/index.js";
import { indexerStatus } from "./indexerService.js";

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
