import { Router } from "express";
import { loadConfig } from "../config.js";
import { AppError, ErrorCodes, toErrorResponse } from "../lib/errors.js";
import { ledgerRepo, statsRepo, campaignsRepo } from "../repositories/index.js";
import { requireRole } from "../middleware/auth.js";
import { Roles } from "../auth/roles.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { campaignId, type, limit, page, verifiedOnChain } = req.query;
    const verifiedFilter =
      verifiedOnChain === "true" || verifiedOnChain === "1"
        ? true
        : verifiedOnChain === "false" || verifiedOnChain === "0"
          ? false
          : undefined;
    const result = await ledgerRepo.list({
      campaignId,
      type,
      limit: limit ? Number(limit) : 50,
      page: page ? Number(page) : 1,
      verifiedOnChain: verifiedFilter,
    });
    const rows = Array.isArray(result) ? result : result.items || [];

    const enriched = [];
    for (const event of rows) {
      const campaign = event.campaignId ? await campaignsRepo.getById(event.campaignId) : null;
      enriched.push({
        ...event,
        campaignName: campaign?.title || campaign?.name || event.campaignId,
        location: campaign?.location,
        eventTrust: event.verifiedOnChain ? "on_chain_verified" : "demo_or_application",
      });
    }

    const meta = Array.isArray(result)
      ? {
          page: 1,
          limit: enriched.length,
          total: enriched.length,
          totalPages: 1,
        }
      : {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        };

    res.json({ success: true, data: enriched, meta });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get("/stats", async (_req, res) => {
  res.json(await statsRepo.get());
});

/** Development utility — requires ALLOW_STORE_RESET + ADMIN session */
router.post("/reset", requireRole(Roles.ADMIN), async (_req, res) => {
  try {
    const cfg = loadConfig();
    if (!cfg.allowStoreReset) {
      throw new AppError(ErrorCodes.FORBIDDEN, "reset disabled");
    }
    res.json(await statsRepo.reset());
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    res.status(status).json(body);
  }
});

export default router;
