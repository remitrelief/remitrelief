import * as store from "../data/store.js";

export const campaignsRepo = {
  list: async (filters) => store.listCampaigns(filters),
  getById: async (id) => store.getCampaign(id),
  create: async (input) => store.createCampaign(input),
  update: async (id, input) => store.updateCampaign(id, input),
  transition: async (id, status, reason) => store.transitionCampaign(id, status, reason),
  deleteDraft: async (id) => store.deleteDraftCampaign(id),
  setMilestonesVerified: async (id, count) => store.setMilestonesVerified(id, count),
};

export const milestonesRepo = {
  create: async (campaignId, input) => store.createMilestone(campaignId, input),
  update: async (id, input) => store.updateMilestone(id, input),
  findById: async (id) => store.getMilestone(id),
};

export const campaignUpdatesRepo = {
  create: async (campaignId, authorId, input) =>
    store.createCampaignUpdate(campaignId, authorId, input),
  list: async (campaignId, options) => store.listCampaignUpdates(campaignId, options),
  findById: async (id) => store.getCampaignUpdate(id),
  update: async (id, input) => store.updateCampaignUpdate(id, input),
};

export const campaignMediaRepo = {
  create: async (campaignId, input) => store.createCampaignMedia(campaignId, input),
  remove: async (id) => store.removeCampaignMedia(id),
  findById: async (id) => store.getCampaignMedia(id),
};

export const donationsRepo = {
  list: async (filters) => store.listDonations(filters),
  findByTxHash: async (txHash) => store.findDonationByTxHash(txHash),
  create: async (input) => store.recordDonation(input),
};

export const ledgerRepo = {
  list: async (filters) => store.listLedger(filters),
  append: async (event) => store.appendLedger(event),
  findExisting: async (query) => store.findLedgerEvent(query),
};

export const statsRepo = {
  get: async () => store.getStats(),
  reset: async () => store.resetStore(),
};

export const usersRepo = {
  getByPublicKey: async (publicKey) => store.getUser(publicKey),
  findById: async (id) => store.getUser(id),
  upsertFromLogin: async (publicKey) => store.upsertUser(publicKey),
  addRole: async (publicKey, role) => store.addUserRole(publicKey, role),
  updateStatus: async (userId, status) => {
    const user = store.getUser(userId);
    if (!user) return null;
    const updated = store.upsertUser(user.publicKey || userId, { status });
    if (status !== "ACTIVE") {
      store.revokeAllSessionsForUser(userId);
    }
    return updated;
  },
  saveChallenge: async (row) => store.saveAuthChallenge(row),
  getChallenge: async (publicKey, nonce) => store.getAuthChallenge(publicKey, nonce),
  consumeChallenge: async (publicKey, nonce) => store.consumeAuthChallenge(publicKey, nonce),
};

/** SessionRepository — Phase 3 can swap to PostgreSQL without rewriting auth services. */
export const sessionsRepo = {
  create: async (input) => store.createSession(input),
  find: async (id) => store.findSession(id),
  touch: async (id) => store.touchSession(id),
  revoke: async (id) => store.revokeSession(id),
  revokeAllForUser: async (userId) => store.revokeAllSessionsForUser(userId),
};

export const auditRepo = {
  create: async (input) => store.createAuditLog(input),
  findByUser: async (userId) => store.listAuditLogsByUser(userId),
  findRecent: async () => [],
};

export const profilesRepo = {
  findByUserId: async () => null,
  create: async () => null,
  update: async () => null,
};

export const organizationsRepo = {
  create: async (input) => store.createOrganization(input),
  findById: async (id) => store.getOrganization(id),
  findBySlug: async (slug) => store.getOrganization(slug),
  addMember: async (input) => store.addOrganizationMember(input),
  listMembers: async (organizationId) => store.listOrganizationMembers(organizationId),
  listForUser: async (userId) => store.listOrganizationsForUser(userId),
};

export const indexerRepo = {
  getCursor: async (key) => store.getIndexerCursor(key),
  setCursor: async (key, value) => store.setIndexerCursor(key, value),
};
