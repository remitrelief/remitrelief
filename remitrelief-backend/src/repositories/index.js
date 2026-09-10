/**
 * Repository boundary — Prisma (PostgreSQL) or JSON (tests/offline only).
 *
 * Production / STORE_DRIVER=prisma|postgres requires DATABASE_URL.
 * No silent fallback to store.json when Postgres is expected.
 */

import { loadConfig } from "../config.js";

function resolveDriver() {
  const cfg = loadConfig();
  const d = cfg.storeDriver;
  if (d === "postgres" || d === "prisma") return "prisma";
  return "json";
}

const driver = resolveDriver();

const impl =
  driver === "prisma"
    ? await import("./prisma/index.js")
    : await import("./jsonRepos.js");

export const campaignsRepo = impl.campaignsRepo;
export const milestonesRepo = impl.milestonesRepo;
export const campaignUpdatesRepo = impl.campaignUpdatesRepo;
export const campaignMediaRepo = impl.campaignMediaRepo;
export const donationsRepo = impl.donationsRepo;
export const ledgerRepo = impl.ledgerRepo;
export const statsRepo = impl.statsRepo;
export const usersRepo = impl.usersRepo;
export const sessionsRepo = impl.sessionsRepo;
export const indexerRepo = impl.indexerRepo;
export const auditRepo = impl.auditRepo || {
  create: async () => null,
  findByUser: async () => [],
  findRecent: async () => [],
};
export const profilesRepo = impl.profilesRepo || null;
export const organizationsRepo = impl.organizationsRepo || null;
export const storeDriverName = driver;
