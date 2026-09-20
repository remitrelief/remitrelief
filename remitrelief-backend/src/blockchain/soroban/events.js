import { getSorobanServer } from "./client.js";
import { logger } from "../../lib/logger.js";

/**
 * Fetch recent contract events for an escrow address.
 * Returns normalized [{ type, txHash, topics, value, ledger, amount, milestoneIndex }]
 */
export async function fetchEscrowEvents({ contractId, startLedger, cursor, limit = 100 } = {}) {
  if (!contractId) return { events: [], latestLedger: null, cursor: null };

  const server = getSorobanServer();
  const filters = [
    {
      type: "contract",
      contractIds: [contractId],
    },
  ];

  const request = {
    filters,
    pagination: {
      limit,
      ...(cursor ? { cursor } : {}),
    },
  };

  if (!cursor && startLedger) {
    request.startLedger = startLedger;
  }

  try {
    const page = await server.getEvents(request);
    const events = (page.events || []).map((ev) => normalizeEvent(ev)).filter(Boolean);
    return {
      events,
      latestLedger: page.latestLedger ?? null,
      cursor: page.cursor || page.pagingToken || null,
    };
  } catch (err) {
    logger.warn("getEvents failed", { contractId, reason: err.message });
    throw err;
  }
}

/**
 * Walk Soroban event pages until empty or maxPages.
 */
export async function fetchEscrowEventsPages({
  contractId,
  startLedger,
  cursor,
  limit = 100,
  maxPages = 20,
} = {}) {
  const events = [];
  let nextCursor = cursor || null;
  let latestLedger = null;
  let pages = 0;
  let usedStartLedger = startLedger;

  while (pages < maxPages) {
    const page = await fetchEscrowEvents({
      contractId,
      startLedger: nextCursor ? undefined : usedStartLedger,
      cursor: nextCursor || undefined,
      limit,
    });
    pages += 1;
    latestLedger = page.latestLedger ?? latestLedger;
    events.push(...page.events);
    if (!page.events.length || !page.cursor) {
      nextCursor = page.cursor || nextCursor;
      break;
    }
    nextCursor = page.cursor;
    usedStartLedger = undefined;
  }

  return { events, latestLedger, cursor: nextCursor, pages };
}

export function topicToString(topic) {
  try {
    if (topic == null) return "";
    if (typeof topic === "string") return topic;
    if (typeof topic.sym === "function") return topic.sym().toString();
    if (typeof topic.toString === "function") {
      const s = topic.toString();
      if (s && s !== "[object Object]") return s;
    }
    if (topic._value != null) return String(topic._value);
    return String(topic);
  } catch {
    return "";
  }
}

function extractNumber(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const n = extractNumber(item);
      if (n != null) return n;
    }
  }
  if (typeof value === "object") {
    if (value._value != null) return extractNumber(value._value);
    if (typeof value.toString === "function") {
      const asText = value.toString();
      if (asText && asText !== "[object Object]" && Number.isFinite(Number(asText))) {
        return Number(asText);
      }
    }
  }
  return null;
}

/**
 * Normalize a raw Soroban getEvents row into RemitRelief ledger shape.
 * Exported for unit tests.
 */
export function normalizeEvent(ev) {
  const topics = (ev.topic || ev.topics || []).map(topicToString);
  const typeHint = topics[0] || "";
  let type = null;
  if (typeHint.includes("deposit")) type = "donation";
  else if (typeHint.includes("verify")) type = "verify";
  else if (typeHint.includes("release")) type = "release";
  else if (typeHint.includes("init")) type = "init";
  else return null;

  let milestoneIndex = null;
  if (type === "verify" || type === "release") {
    for (let i = topics.length - 1; i >= 1; i -= 1) {
      const asNum = Number(topics[i]);
      if (Number.isInteger(asNum) && asNum >= 0 && asNum < 100) {
        milestoneIndex = asNum;
        break;
      }
    }
  }

  const value = ev.value ?? ev.data ?? null;
  // deposit data is (amount, total); verify/release data is amount
  const amount =
    type === "donation"
      ? extractNumber(Array.isArray(value) ? value[0] : value)
      : extractNumber(value);

  return {
    type,
    txHash: ev.txHash || ev.transactionHash || null,
    topics,
    ledger: ev.ledger || ev.ledgerCloseTime || null,
    contractId: ev.contractId || null,
    amount: amount != null ? amount : null,
    milestoneIndex,
    raw: ev,
  };
}
