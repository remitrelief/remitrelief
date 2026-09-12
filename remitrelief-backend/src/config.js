/**
 * Centralized backend configuration.
 * Private secrets stay server-side — never import this module from Vite/frontend.
 */

import { Networks } from "@stellar/stellar-sdk";

const SUPPORTED_NETWORKS = new Set(["TESTNET", "FUTURENET", "STANDALONE"]);
const DEV_CORS_DEFAULTS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function envRequired(name, { allowEmpty = false } = {}) {
  const value = process.env[name];
  if ((value == null || value === "") && !allowEmpty) {
    return null;
  }
  return value ?? "";
}

function parseCsv(...names) {
  const set = new Set();
  for (const name of names) {
    const raw = process.env[name];
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const t = part.trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

function resolvePassphrase(network, explicit) {
  if (explicit) return explicit;
  if (network === "TESTNET") return Networks.TESTNET;
  if (network === "PUBLIC" || network === "MAINNET") {
    throw new Error("UNSUPPORTED_NETWORK: mainnet is disabled in this release");
  }
  if (network === "FUTURENET") return "Test SDF Future Network ; October 2022";
  if (network === "STANDALONE") return "Standalone Network ; February 2017";
  throw new Error(`UNSUPPORTED_NETWORK: ${network}`);
}

function resolveExplorerBase(network) {
  if (network === "TESTNET") return "https://stellar.expert/explorer/testnet";
  if (network === "FUTURENET") return "https://stellar.expert/explorer/futurenet";
  return null;
}

function resolveStoreDriver(isProduction) {
  const explicit = (process.env.STORE_DRIVER || "").toLowerCase();
  if (explicit === "json") {
    if (isProduction) {
      throw new Error("STORE_DRIVER=json is not allowed in production — use PostgreSQL/Prisma");
    }
    return "json";
  }
  if (explicit === "postgres" || explicit === "prisma") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when STORE_DRIVER=postgres|prisma");
    }
    return "prisma";
  }
  if (process.env.DATABASE_URL) return "prisma";
  if (isProduction) {
    throw new Error("DATABASE_URL is required in production (PostgreSQL via Prisma)");
  }
  // Local/tests without DATABASE_URL: JSON only (explicit offline mode)
  return "json";
}

function resolveCorsOrigins(isProduction) {
  const fromEnv = parseCsv("CORS_ORIGINS");
  if (fromEnv.length) return fromEnv;
  if (isProduction) {
    throw new Error(
      "CORS_ORIGINS is required in production (comma-separated allowlist; never reflect *)"
    );
  }
  return [...DEV_CORS_DEFAULTS];
}

let cached = null;

export function loadConfig({ fresh = false } = {}) {
  if (cached && !fresh) return cached;

  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const network = (process.env.STELLAR_NETWORK || "TESTNET").toUpperCase();

  if (network === "PUBLIC" || network === "MAINNET") {
    throw new Error("UNSUPPORTED_NETWORK: mainnet is not enabled");
  }
  if (!SUPPORTED_NETWORKS.has(network)) {
    throw new Error(`UNSUPPORTED_NETWORK: ${network}`);
  }

  const demoModeRequested = envBool("DEMO_MODE", !isProduction);
  const demoMode = isProduction ? false : demoModeRequested;

  if (isProduction && demoModeRequested) {
    console.warn(
      "[config] DEMO_MODE was requested but NODE_ENV=production — demo financial mutations are DISABLED"
    );
  }

  const storeDriver = resolveStoreDriver(isProduction);
  if ((storeDriver === "postgres" || storeDriver === "prisma") && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when using Prisma/PostgreSQL");
  }

  const sessionSecret =
    envRequired("AUTH_SESSION_SECRET", { allowEmpty: true }) ||
    envRequired("AUTH_JWT_SECRET", { allowEmpty: true }) ||
    (isProduction ? null : "dev-only-remitrelief-session-secret-change-me");

  if (isProduction && !sessionSecret) {
    throw new Error("AUTH_SESSION_SECRET (or AUTH_JWT_SECRET) is required in production");
  }

  const corsOrigins = resolveCorsOrigins(isProduction);

  const config = Object.freeze({
    nodeEnv,
    isProduction,
    port: Number(process.env.PORT || 4000),
    demoMode,
    allowStoreReset: envBool("ALLOW_STORE_RESET", false) && !isProduction,
    storeDriver,
    databaseUrl: process.env.DATABASE_URL || null,
    corsOrigins,
    auth: Object.freeze({
      sessionSecret,
      sessionTtlSec: Number(process.env.AUTH_SESSION_TTL || process.env.AUTH_TOKEN_TTL_SEC || 60 * 60 * 12),
      challengeTtlSec: Number(process.env.AUTH_CHALLENGE_TTL || process.env.AUTH_CHALLENGE_TTL_SEC || 300),
      cookieName: process.env.AUTH_COOKIE_NAME || "remitrelief_sid",
      cookieSecure: envBool("AUTH_COOKIE_SECURE", isProduction),
      cookieSameSite: process.env.AUTH_COOKIE_SAMESITE || (isProduction ? "lax" : "lax"),
      domain: process.env.AUTH_DOMAIN || "remitrelief",
      /** Dev-only insecure bypass — never enabled in production. */
      allowInsecureDevBypass: envBool("AUTH_DEV_BYPASS", false) && !isProduction,
    }),
    rbac: Object.freeze({
      adminPublicKeys: parseCsv("ADMIN_PUBLIC_KEYS", "OPERATOR_PUBLIC_KEYS"),
      ngoPublicKeys: parseCsv("NGO_PUBLIC_KEYS", "VERIFIER_PUBLIC_KEYS"),
      recipientPublicKeys: parseCsv("RECIPIENT_PUBLIC_KEYS"),
    }),

    stellar: Object.freeze({
      network,
      rpcUrl: process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
      horizonUrl: process.env.HORIZON_URL || "https://horizon-testnet.stellar.org",
      networkPassphrase: resolvePassphrase(network, process.env.NETWORK_PASSPHRASE),
      explorerBase: process.env.EXPLORER_BASE_URL || resolveExplorerBase(network),
      usdcDecimals: 7,
    }),

    secrets: Object.freeze({
      backendSignerSecret: envRequired("BACKEND_SIGNER_SECRET", { allowEmpty: true }),
      internalApiKey: envRequired("INTERNAL_API_KEY", { allowEmpty: true }),
    }),

    demoEscrowContractId: envRequired("DEMO_ESCROW_CONTRACT_ID", { allowEmpty: true }) || null,
    /** Optional USDC / SAC contract id used when binding escrow metadata */
    usdcContractId: envRequired("USDC_CONTRACT_ID", { allowEmpty: true }) || null,
  });

  cached = config;
  return config;
}

export function resetConfigCache() {
  cached = null;
}

export function assertDemoModeAllowed() {
  const cfg = loadConfig();
  if (!cfg.demoMode) {
    const err = new Error("Demo financial mutations are disabled");
    err.code = "DEMO_MODE_DISABLED";
    err.status = 403;
    throw err;
  }
}

export function requireInternalApiKey(provided) {
  const cfg = loadConfig();
  if (!cfg.secrets.internalApiKey) {
    const err = new Error("INTERNAL_API_KEY is not configured — privileged ops unavailable");
    err.code = "FORBIDDEN";
    err.status = 403;
    throw err;
  }
  if (!provided || provided !== cfg.secrets.internalApiKey) {
    const err = new Error("Invalid or missing internal API key");
    err.code = "UNAUTHORIZED";
    err.status = 401;
    throw err;
  }
}

export function publicConfig() {
  const cfg = loadConfig();
  return {
    network: cfg.stellar.network,
    demoMode: cfg.demoMode,
    explorerBase: cfg.stellar.explorerBase,
    rpcUrl: cfg.stellar.rpcUrl,
    storeDriver: cfg.storeDriver,
    authEnabled: true,
    authMode: "wallet_session",
  };
}
