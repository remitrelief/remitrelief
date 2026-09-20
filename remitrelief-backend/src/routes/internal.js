import { Router } from "express";
import { requireInternalApiKey } from "../config.js";
import { runIndexer, indexerStatus } from "../services/indexerService.js";
import { toErrorResponse } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const router = Router();

function assertInternal(req) {
  const key = req.get("x-internal-api-key") || req.body?.internalApiKey;
  try {
    requireInternalApiKey(key);
    return;
  } catch {
    // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.get("authorization") || "";
    if (cronSecret && auth === `Bearer ${cronSecret}`) return;
    requireInternalApiKey(key);
  }
}

router.get("/indexer/status", async (req, res) => {
  try {
    assertInternal(req);
    res.json(await indexerStatus());
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get("/indexer/run", async (req, res) => {
  try {
    assertInternal(req);
    logger.info("Indexer run requested (GET/cron)");
    const summary = await runIndexer({
      limitPerContract: Number(req.query?.limitPerContract) || 50,
      maxPages: Number(req.query?.maxPages) || 20,
      campaignId: req.query?.campaignId || undefined,
      backfill: req.query?.backfill === "true" || req.query?.backfill === "1",
      lookbackLedgers: req.query?.lookbackLedgers
        ? Number(req.query.lookbackLedgers)
        : undefined,
    });
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error("Indexer run failed", { reason: err.message });
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

router.post("/indexer/run", async (req, res) => {
  try {
    assertInternal(req);
    logger.info("Indexer run requested");
    const summary = await runIndexer({
      limitPerContract: Number(req.body?.limitPerContract) || 50,
      maxPages: Number(req.body?.maxPages) || 20,
      campaignId: req.body?.campaignId || undefined,
      backfill: Boolean(req.body?.backfill),
      lookbackLedgers: req.body?.lookbackLedgers
        ? Number(req.body.lookbackLedgers)
        : undefined,
    });
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error("Indexer run failed", { reason: err.message });
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

export default router;
