import { Roles } from "./roles.js";

/** Centralized permission catalog (Phase 2.2 foundation). */
export const Permissions = Object.freeze({
  CAMPAIGN_CREATE: "campaign:create",
  CAMPAIGN_UPDATE: "campaign:update",
  CAMPAIGN_DELETE: "campaign:delete",
  CAMPAIGN_SUBMIT: "campaign:submit",
  CAMPAIGN_MODERATE: "campaign:moderate",
  CAMPAIGN_UPDATE_PUBLISH: "campaign:update:publish",
  DONATION_CREATE: "donation:create",
  DONATION_VIEW: "donation:view",
  RELEASE_CREATE: "release:create",
  RELEASE_APPROVE: "release:approve",
  RELEASE_EXECUTE: "release:execute",
  MILESTONE_VERIFY: "milestone:verify",
  NGO_APPLY: "ngo:apply",
  NGO_MANAGE: "ngo:manage",
  ADMIN_USERS: "admin:users",
  ADMIN_CAMPAIGNS: "admin:campaigns",
  ADMIN_NGOS: "admin:ngos",
  ADMIN_TRANSACTIONS: "admin:transactions",
  ADMIN_AUDIT: "admin:audit",
  LEDGER_RESET: "ledger:reset",
});

const ROLE_PERMISSIONS = Object.freeze({
  [Roles.DONOR]: [
    Permissions.DONATION_CREATE,
    Permissions.DONATION_VIEW,
    Permissions.CAMPAIGN_CREATE,
    Permissions.CAMPAIGN_UPDATE,
    Permissions.CAMPAIGN_DELETE,
    Permissions.CAMPAIGN_SUBMIT,
    Permissions.CAMPAIGN_UPDATE_PUBLISH,
  ],
  [Roles.RECIPIENT]: [Permissions.DONATION_VIEW],
  [Roles.NGO]: [
    Permissions.DONATION_VIEW,
    Permissions.CAMPAIGN_CREATE,
    Permissions.CAMPAIGN_UPDATE,
    Permissions.CAMPAIGN_DELETE,
    Permissions.CAMPAIGN_SUBMIT,
    Permissions.CAMPAIGN_UPDATE_PUBLISH,
    Permissions.MILESTONE_VERIFY,
    Permissions.RELEASE_CREATE,
    Permissions.RELEASE_APPROVE,
    Permissions.NGO_MANAGE,
  ],
  [Roles.ADMIN]: Object.values(Permissions),
  [Roles.UNASSIGNED]: [],
});

export function permissionsForRoles(roles = []) {
  const set = new Set();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] || []) set.add(p);
  }
  return [...set];
}

export function roleHasPermission(roles, permission) {
  return permissionsForRoles(roles).includes(permission);
}
